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
  InsightBlock,
  ExecutiveInsight,
} from '@/lib/reportTypes';
import {
  buildTrustBlock,
  computeSeverity,
  buildInsightAnchors,
  computeConfidenceReason,
  type InsightAnchors,
} from '@/lib/reportHelpers';

// ── Event/correlation formatting ──────────────────────────────────────────────

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

// ── Anchor context ────────────────────────────────────────────────────────────

function formatAnchorContext(anchors: InsightAnchors): string {
  const lines: string[] = [
    'ЯКОРНЫЕ СОБЫТИЯ для executiveInsight (обязательно используй эти ID):',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  if (anchors.topThreat) {
    const e = anchors.topThreat;
    lines.push(`Главная угроза → событие [ID: ${e.id}]`);
    lines.push(`  «${e.title}»`);
    if (e.threats?.length) lines.push(`  Угрозы: ${e.threats.slice(0, 2).join(' | ')}`);
    lines.push(`  ОБЯЗАТЕЛЬНО включи ID "${e.id}" в mainThreat.sourceEventIds`);
  } else {
    lines.push('Главная угроза → конкурентных событий нет — поле mainThreat НЕ включать');
  }

  lines.push('');

  if (anchors.topOpportunity) {
    const e = anchors.topOpportunity;
    const deadline = e.expiresAt
      ? `, дедлайн ${new Date(e.expiresAt).toLocaleDateString('ru-RU')}`
      : '';
    lines.push(`Главная возможность → событие [ID: ${e.id}]`);
    lines.push(`  «${e.title}»${deadline}`);
    if (e.opportunities?.length) lines.push(`  Возможности: ${e.opportunities.slice(0, 2).join(' | ')}`);
    lines.push(`  ОБЯЗАТЕЛЬНО включи ID "${e.id}" в mainOpportunity.sourceEventIds`);
  } else {
    lines.push('Главная возможность → тендерных событий нет — поле mainOpportunity НЕ включать');
  }

  lines.push('');

  if (anchors.mostUrgent) {
    const e = anchors.mostUrgent;
    const deadline = e.expiresAt
      ? `, дедлайн ${new Date(e.expiresAt).toLocaleDateString('ru-RU')}`
      : '';
    lines.push(`Что решить сейчас → событие [ID: ${e.id}]`);
    lines.push(`  «${e.title}»${deadline}`);
    lines.push(`  ОБЯЗАТЕЛЬНО включи ID "${e.id}" в urgentAction.sourceEventIds`);
  }

  if (anchors.topCluster && anchors.topCluster.strength > 70) {
    lines.push('');
    lines.push(`Ключевая корреляция → [ID: ${anchors.topCluster.id}] · сила ${anchors.topCluster.strength}`);
    lines.push(`  Включи этот ID в mainConclusion.sourceCorrelationIds`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(
  events: TriggerEvent[],
  correlations: CorrelationSnapshot[],
  anchors: InsightAnchors,
): string {
  const eventsText = events.map(formatEventForPrompt).join('\n\n---\n\n');
  const corrText = correlations.length > 0
    ? correlations.map(formatCorrelationForPrompt).join('\n\n')
    : 'Корреляций нет.';

  const anchorCtx = formatAnchorContext(anchors);
  const hasThreat = !!anchors.topThreat;
  const hasOpportunity = !!anchors.topOpportunity;

  return `Роль: аналитик компании «Авангард. Профессиональная экипировка». Отчёт читает директор — он принимает стратегические решения.

ПРОФИЛЬ АВАНГАРДА:
${formatCompanyContext()}

СОБЫТИЯ ДЛЯ АНАЛИЗА (используй эти ID в sourceEventIds):
${eventsText}

КОРРЕЛЯЦИОННЫЕ ПАТТЕРНЫ (используй эти ID в sourceCorrelationIds):
${corrText}

${anchorCtx}

ЗАДАЧА: Напиши Executive Report строго в формате JSON по схеме ниже.

ЖЁСТКИЕ ПРАВИЛА:
1. В executiveInsight — ТОЛЬКО якорные ID из инструкции выше
2. В sections и priorityActions — только ID из списка событий
3. Никаких тезисов без sourceEventIds
4. Цифры, названия, сроки в каждом предложении
5. evidenceQuotes — прямые цитаты из текста событий, не перефразировка
6. Отвечай ТОЛЬКО JSON, без комментариев и markdown-обёртки

JSON СХЕМА:
{
  "headline": "2–3 предложения о главном для Авангарда",
  "executiveInsight": {
    "mainConclusion": {
      "text": "Главный вывод по всей рыночной картине — 1–2 ёмких предложения с цифрами",
      "sourceEventIds": ["несколько ключевых ID из всего списка"],
      "sourceCorrelationIds": ["corr-id если сила > 70, иначе []"],
      "evidenceQuotes": []
    },
    ${hasThreat ? `"mainThreat": {
      "text": "Конкретная угроза — имя конкурента, число, ставка — 1–2 предложения",
      "sourceEventIds": ["${anchors.topThreat!.id}"],
      "evidenceQuotes": ["прямая цитата из события ${anchors.topThreat!.id}"]
    },` : ''}
    ${hasOpportunity ? `"mainOpportunity": {
      "text": "Конкретная возможность — сумма, дедлайн, условие — 1–2 предложения",
      "sourceEventIds": ["${anchors.topOpportunity!.id}"],
      "evidenceQuotes": []
    },` : ''}
    "urgentAction": {
      "text": "Одно конкретное действие — кто, что, до какой даты",
      "sourceEventIds": ["${anchors.mostUrgent?.id ?? (events[0]?.id ?? '')}"],
      "evidenceQuotes": []
    }
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
      "deadline": "конкретная дата ДД.ММ.ГГГГ",
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

// ── Response parsing ──────────────────────────────────────────────────────────

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

function parseInsightBlock(
  raw: unknown,
  validEventIds: Set<string>,
  validCorrIds: Set<string>,
  eventMap: Map<string, TriggerEvent>,
  clusters: CorrelationSnapshot[],
  anchorEventId?: string,
  anchorCorrId?: string,
): InsightBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;

  const text = typeof t.text === 'string' ? t.text.trim() : '';
  if (!text) return null;

  const filterIds = (arr: unknown, valid: Set<string>): string[] =>
    Array.isArray(arr) ? arr.filter((id): id is string => typeof id === 'string' && valid.has(id)) : [];
  const filterStrings = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];

  let sourceEventIds = filterIds(t.sourceEventIds, validEventIds);
  let sourceCorrelationIds = filterIds(t.sourceCorrelationIds, validCorrIds);

  // Enforce anchor IDs — Gemini may forget to include them
  if (anchorEventId && validEventIds.has(anchorEventId) && !sourceEventIds.includes(anchorEventId)) {
    sourceEventIds = [anchorEventId, ...sourceEventIds];
  }
  if (anchorCorrId && validCorrIds.has(anchorCorrId) && !sourceCorrelationIds.includes(anchorCorrId)) {
    sourceCorrelationIds = [anchorCorrId, ...sourceCorrelationIds];
  }

  // Block must have at least one source event
  if (sourceEventIds.length === 0) return null;

  const scores = sourceEventIds
    .map(id => eventMap.get(id)?.confidenceScore)
    .filter((s): s is number => s !== undefined);
  const confidenceScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : undefined;

  const confidenceReason = computeConfidenceReason(
    sourceEventIds,
    sourceCorrelationIds.length > 0 ? sourceCorrelationIds : undefined,
    eventMap,
    clusters,
  );

  return {
    text,
    sourceEventIds,
    sourceCorrelationIds: sourceCorrelationIds.length > 0 ? sourceCorrelationIds : undefined,
    confidenceScore,
    confidenceReason,
    evidenceQuotes: filterStrings(t.evidenceQuotes),
  };
}

function parseExecutiveInsight(
  raw: unknown,
  validEventIds: Set<string>,
  validCorrIds: Set<string>,
  eventMap: Map<string, TriggerEvent>,
  clusters: CorrelationSnapshot[],
  anchors: InsightAnchors,
): ExecutiveInsight | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const ri = raw as Record<string, unknown>;

  const mainConclusion = parseInsightBlock(
    ri.mainConclusion,
    validEventIds, validCorrIds, eventMap, clusters,
    undefined,
    anchors.topCluster && anchors.topCluster.strength > 70 ? anchors.topCluster.id : undefined,
  );
  if (!mainConclusion) return undefined;

  const mainThreat = anchors.topThreat
    ? parseInsightBlock(ri.mainThreat, validEventIds, validCorrIds, eventMap, clusters, anchors.topThreat.id)
    : null;

  const mainOpportunity = anchors.topOpportunity
    ? parseInsightBlock(ri.mainOpportunity, validEventIds, validCorrIds, eventMap, clusters, anchors.topOpportunity.id)
    : null;

  const urgentAction = parseInsightBlock(
    ri.urgentAction,
    validEventIds, validCorrIds, eventMap, clusters,
    anchors.mostUrgent?.id,
  );
  if (!urgentAction) return undefined;

  return {
    mainConclusion,
    ...(mainThreat ? { mainThreat } : {}),
    ...(mainOpportunity ? { mainOpportunity } : {}),
    urgentAction,
  };
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

  // Deterministic anchor selection — server chooses facts, Gemini writes narrative
  const anchors = buildInsightAnchors(events, correlations);

  const prompt = buildPrompt(events, correlations, anchors);

  let geminiJson: Record<string, unknown>;
  try {
    const raw = await callGemini(prompt, true);
    geminiJson = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return Response.json({ error: `Ошибка генерации отчёта: ${msg}` }, { status: 500 });
  }

  // Parse Executive Insight (Phase 8.5)
  const executiveInsight = parseExecutiveInsight(
    geminiJson.executiveInsight,
    validEventIds, validCorrIds, eventMap, correlations, anchors,
  );

  // Parse content sections (require source per tezis)
  const rawSections = Array.isArray(geminiJson.sections) ? geminiJson.sections : [];
  const sections = rawSections
    .map(s => parseSection(s, validEventIds, validCorrIds, eventMap, true))
    .filter(s => s.title.length > 0 && s.tezises.length > 0);

  const priorityActions = parseActions(geminiJson.priorityActions, validEventIds, validCorrIds);
  const headline = typeof geminiJson.headline === 'string' ? geminiJson.headline : '';

  // Deterministic fields — never from Gemini
  const trustBlock = buildTrustBlock(events, correlations);
  const reportSeverity = computeSeverity(events, correlations);

  const report: StructuredReport = {
    headline,
    executiveInsight,
    avangardImpactSection: { title: '', tezises: [] }, // empty for 8.5+ reports; legacy kept for old stored reports
    sections,
    priorityActions,
    trustBlock,
    reportSeverity,
    generatedAt: new Date().toISOString(),
  };

  return Response.json({ report });
}
