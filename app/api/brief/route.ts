import { type NextRequest } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { formatCompanyContext } from '@/lib/company';
import type { TriggerEvent } from '@/lib/types';
import type {
  CorrelationSnapshot,
  StructuredReport,
  ReportSection,
  ReportTezis,
  ReportAction,
} from '@/lib/reportTypes';
import { buildTrustBlock, computeSeverity } from '@/lib/reportHelpers';

// ── Prompt helpers ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  news: 'Новость', tender: 'Тендер', competitor: 'Конкурент',
  regulation: 'Регуляторика', other: 'Прочее',
};
const IMPORTANCE_LABELS: Record<string, string> = {
  critical: 'Критично', high: 'Важно', medium: 'Средне', low: 'Фон',
};

function formatEventForPrompt(e: TriggerEvent): string {
  const imp = e.avangardImpact?.level ?? e.importance ?? 'low';
  const lines = [
    `[ID: ${e.id}]`,
    `Категория: ${CATEGORY_LABELS[e.category] ?? e.category} · Важность: ${IMPORTANCE_LABELS[imp] ?? imp}`,
    `Заголовок: ${e.title}`,
  ];
  if (e.competitorName) lines.push(`Конкурент: ${e.competitorName}`);
  if (e.whatHappened) lines.push(`Что произошло: ${e.whatHappened}`);
  else lines.push(`Резюме: ${e.summary}`);
  const why = e.whyItMattersForAvangard ?? e.whyItMattersForWorkwear;
  if (why) lines.push(`Влияние на Авангард: ${why}`);
  if (e.threats?.length) lines.push(`Угрозы: ${e.threats.slice(0, 2).join(' | ')}`);
  if (e.opportunities?.length) lines.push(`Возможности: ${e.opportunities.slice(0, 2).join(' | ')}`);
  if (e.suggestedAction) lines.push(`Рекомендация: ${e.suggestedAction}`);
  return lines.join('\n');
}

function formatCorrelationForPrompt(c: CorrelationSnapshot): string {
  return `[ID: ${c.id}]\nНазвание: ${c.label} · Сила: ${c.strength}\nИнсайт: ${c.insight}\nСобытия: ${c.eventIds.join(', ')}`;
}

function buildPrompt(events: TriggerEvent[], correlations: CorrelationSnapshot[]): string {
  const eventsText = events.map(formatEventForPrompt).join('\n\n---\n\n');
  const corrText = correlations.length > 0
    ? correlations.map(formatCorrelationForPrompt).join('\n\n')
    : 'Корреляций нет.';

  return `Роль: аналитик компании «Авангард. Профессиональная экипировка». Отчёт читает директор — он принимает стратегические решения.

ПРОФИЛЬ АВАНГАРДА:
${formatCompanyContext()}

СОБЫТИЯ ДЛЯ АНАЛИЗА (используй эти ID в sourceEventIds):
${eventsText}

КОРРЕЛЯЦИОННЫЕ ПАТТЕРНЫ (используй эти ID в sourceCorrelationIds):
${corrText}

ЗАДАЧА: Напиши Executive Report строго в формате JSON по схеме ниже.

ЖЁСТКИЕ ПРАВИЛА:
1. Каждый тезис ОБЯЗАТЕЛЬНО содержит sourceEventIds — только ID из списка выше
2. Никаких тезисов без источника — если нет подходящего sourceEventId, не пиши тезис
3. Цифры, названия, сроки в каждом предложении
4. evidenceQuotes — прямые цитаты из текста событий выше, не перефразировка
5. Отвечай ТОЛЬКО JSON, без комментариев и markdown-обёртки

JSON СХЕМА (следуй точно):
{
  "headline": "2–3 предложения о главном для Авангарда",
  "avangardImpact": {
    "tezises": [
      {
        "text": "Какие продуктовые направления Авангарда затронуты — конкретно (спецодежда/обувь/СИЗ + детали)",
        "sourceEventIds": ["id1"],
        "sourceCorrelationIds": [],
        "evidenceQuotes": []
      },
      {
        "text": "Какие клиентские отрасли Авангарда затронуты (нефтегаз/металлургия/строительство/...)",
        "sourceEventIds": ["id1", "id2"],
        "sourceCorrelationIds": [],
        "evidenceQuotes": []
      },
      {
        "text": "Какие функции бизнеса Авангарда затронуты (продажи/закупки/производство/маркетинг/продукт)",
        "sourceEventIds": ["id1"],
        "sourceCorrelationIds": [],
        "evidenceQuotes": []
      },
      {
        "text": "Ключевые риски и возможности — конкретно для Авангарда",
        "sourceEventIds": ["id1"],
        "sourceCorrelationIds": ["corr-id"],
        "evidenceQuotes": ["прямая цитата из события"]
      }
    ]
  },
  "sections": [
    {
      "title": "Конкурентные угрозы",
      "tezises": [
        {
          "text": "конкретный тезис с именами и цифрами",
          "sourceEventIds": ["id1"],
          "sourceCorrelationIds": [],
          "evidenceQuotes": ["цитата"]
        }
      ]
    }
  ],
  "priorityActions": [
    {
      "action": "конкретное действие с измеримым результатом",
      "responsible": "кто в Авангарде",
      "deadline": "конкретная дата",
      "sourceEventIds": ["id1"],
      "sourceCorrelationIds": []
    }
  ]
}

РАЗДЕЛЫ в sections (добавляй только те, для которых есть события):
- "Конкурентные угрозы" — для competitor events
- "Горячие тендеры" — для tender events
- "Регуляторика" — для regulation events
- "Материалы и технологии" — для news events про материалы или технологии
- "Корреляции и паттерны" — если есть кластеры с силой >= 40

ПРИОРИТЕТНЫЕ ДЕЙСТВИЯ: 3–5 конкретных шагов с исполнителем и дедлайном.`;
}

// ── Response parsing ───────────────────────────────────────────────────────────

function parseTezis(raw: unknown, validEventIds: Set<string>, validCorrIds: Set<string>): ReportTezis {
  if (!raw || typeof raw !== 'object') return { text: '' };
  const t = raw as Record<string, unknown>;
  const filterIds = (arr: unknown, valid: Set<string>): string[] =>
    Array.isArray(arr) ? arr.filter((id): id is string => typeof id === 'string' && valid.has(id)) : [];
  const filterStrings = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
  return {
    text: typeof t.text === 'string' ? t.text : '',
    sourceEventIds: filterIds(t.sourceEventIds, validEventIds),
    sourceCorrelationIds: filterIds(t.sourceCorrelationIds, validCorrIds),
    evidenceQuotes: filterStrings(t.evidenceQuotes),
  };
}

function enrichWithConfidence(
  tezis: ReportTezis,
  eventMap: Map<string, TriggerEvent>,
): ReportTezis {
  const scores = (tezis.sourceEventIds ?? [])
    .map(id => eventMap.get(id)?.confidenceScore)
    .filter((s): s is number => s !== undefined);
  return scores.length > 0
    ? { ...tezis, confidenceScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }
    : tezis;
}

function parseSection(
  raw: unknown,
  validEventIds: Set<string>,
  validCorrIds: Set<string>,
  eventMap: Map<string, TriggerEvent>,
  requireSource = false,
): ReportSection {
  if (!raw || typeof raw !== 'object') return { title: '', tezises: [] };
  const s = raw as Record<string, unknown>;
  const tezises = Array.isArray(s.tezises)
    ? s.tezises
        .map(t => enrichWithConfidence(parseTezis(t, validEventIds, validCorrIds), eventMap))
        .filter(t => {
          if (!t.text.length) return false;
          if (requireSource && (t.sourceEventIds?.length ?? 0) === 0) return false;
          return true;
        })
    : [];
  const scores = tezises.map(t => t.confidenceScore).filter((n): n is number => n !== undefined);
  return {
    title: typeof s.title === 'string' ? s.title : '',
    tezises,
    avgConfidence: scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : undefined,
  };
}

function parseActions(
  raw: unknown,
  validEventIds: Set<string>,
  validCorrIds: Set<string>,
): ReportAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(a => a && typeof a === 'object')
    .map(a => {
      const act = a as Record<string, unknown>;
      const filterIds = (arr: unknown, valid: Set<string>): string[] =>
        Array.isArray(arr) ? arr.filter((id): id is string => typeof id === 'string' && valid.has(id)) : [];
      return {
        action: typeof act.action === 'string' ? act.action : '',
        responsible: typeof act.responsible === 'string' ? act.responsible : undefined,
        deadline: typeof act.deadline === 'string' ? act.deadline : undefined,
        sourceEventIds: filterIds(act.sourceEventIds, validEventIds),
        sourceCorrelationIds: filterIds(act.sourceCorrelationIds, validCorrIds),
      };
    })
    .filter(a => a.action.length > 0);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let events: TriggerEvent[];
  let correlations: CorrelationSnapshot[];

  try {
    const body = await request.json();
    events = body.events;
    correlations = Array.isArray(body.correlations) ? body.correlations : [];
    if (!Array.isArray(events) || events.length === 0) {
      return Response.json({ error: 'Нет событий для отчёта' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const validEventIds = new Set(events.map(e => e.id));
  const validCorrIds = new Set(correlations.map(c => c.id));
  const eventMap = new Map(events.map(e => [e.id, e]));

  const prompt = buildPrompt(events, correlations);

  let geminiJson: Record<string, unknown>;
  try {
    const raw = await callGemini(prompt, true);
    geminiJson = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return Response.json({ error: `Ошибка генерации отчёта: ${msg}` }, { status: 500 });
  }

  // Parse sections — require at least one valid sourceEventId per tezis
  const rawSections = Array.isArray(geminiJson.sections) ? geminiJson.sections : [];
  const sections = rawSections
    .map(s => parseSection(s, validEventIds, validCorrIds, eventMap, true))
    .filter(s => s.title.length > 0 && s.tezises.length > 0);

  // Parse avangardImpact — analytical section, sources optional
  const rawImpact = geminiJson.avangardImpact;
  const avangardImpactSection = parseSection(
    rawImpact && typeof rawImpact === 'object'
      ? { title: 'Почему это важно для Авангарда', ...(rawImpact as object) }
      : { title: 'Почему это важно для Авангарда', tezises: [] },
    validEventIds,
    validCorrIds,
    eventMap,
    false,
  );

  const priorityActions = parseActions(geminiJson.priorityActions, validEventIds, validCorrIds);
  const headline = typeof geminiJson.headline === 'string' ? geminiJson.headline : '';

  // Compute deterministic fields from data
  const trustBlock = buildTrustBlock(events, correlations);
  const reportSeverity = computeSeverity(events, correlations);

  const report: StructuredReport = {
    headline,
    avangardImpactSection,
    sections,
    priorityActions,
    trustBlock,
    reportSeverity,
    generatedAt: new Date().toISOString(),
  };

  return Response.json({ report });
}
