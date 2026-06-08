import { type NextRequest } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { formatCompanyContext } from '@/lib/company';
import type { EventCategory, EventImportance, AvangardImpact, EvidenceBlock, AnalyticsEvidence } from '@/lib/types';

interface DomainHints {
  forcedCategory?: EventCategory;
  forcedMinimumImpact?: 'medium' | 'high';
  sourceKind?: string;
  reason?: string;
}

const IMPACT_ORDER: EventImportance[] = ['low', 'medium', 'high', 'critical'];

function preclassifySource(rawUrl: string): DomainHints {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return {};
  }

  const COMPETITOR_DOMAINS: [string, string][] = [
    ['technoavia', 'Техноавиа'],
    ['vostok-service', 'Восток-Сервис'],
    ['ursus', 'Урсус'],
    ['soyuzspecodezhda', 'Союзспецодежда'],
    ['trakt', 'Тракт'],
    ['fakel', 'Факел-Профи'],
  ];

  for (const [pattern, name] of COMPETITOR_DOMAINS) {
    if (hostname.includes(pattern)) {
      return {
        forcedCategory: 'competitor',
        forcedMinimumImpact: 'medium',
        sourceKind: `сайт конкурента (${name})`,
        reason: `Домен содержит паттерн конкурента «${name}»`,
      };
    }
  }

  const TENDER_DOMAINS = [
    'zakupki.gov.ru',
    'b2b-center.ru',
    'roseltorg.ru',
    'fabrikant.ru',
    'sberb2b.ru',
  ];

  for (const domain of TENDER_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return {
        forcedCategory: 'tender',
        sourceKind: 'тендерный портал',
        reason: `Известный тендерный портал: ${domain}`,
      };
    }
  }

  const REGULATION_DOMAINS = [
    'consultant.ru',
    'garant.ru',
    'minpromtorg.gov.ru',
    'regulation.gov.ru',
    'eec.eaeunion.org',
  ];

  for (const domain of REGULATION_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return {
        forcedCategory: 'regulation',
        sourceKind: 'регуляторный портал',
        reason: `Известный регуляторный портал: ${domain}`,
      };
    }
  }

  return {};
}

function extractText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const VALID_CATEGORIES: EventCategory[] = ['news', 'tender', 'competitor', 'regulation', 'other'];
const VALID_IMPORTANCE: EventImportance[] = ['critical', 'high', 'medium', 'low'];

function parseEvidenceBlock(raw: unknown): EvidenceBlock | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    quotes: Array.isArray(r.quotes) ? r.quotes.map(String).filter(Boolean) : [],
    interpretation: typeof r.interpretation === 'string' ? r.interpretation : '',
  };
}

function parseEvidence(raw: unknown): AnalyticsEvidence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const ev: AnalyticsEvidence = {};

  // Support both new and old key for backward compat with stored events
  const why = parseEvidenceBlock(r.whyItMattersForAvangard) ?? parseEvidenceBlock(r.whyItMattersForWorkwear);
  if (why) ev.whyItMattersForAvangard = why;

  if (Array.isArray(r.opportunities)) {
    ev.opportunities = r.opportunities.map(parseEvidenceBlock).filter((b): b is EvidenceBlock => b !== undefined);
  }

  if (Array.isArray(r.threats)) {
    ev.threats = r.threats.map(parseEvidenceBlock).filter((b): b is EvidenceBlock => b !== undefined);
  }

  const action = parseEvidenceBlock(r.suggestedAction);
  if (action) ev.suggestedAction = action;

  return Object.keys(ev).length ? ev : undefined;
}

function parseAvangardImpact(raw: unknown): AvangardImpact | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!VALID_IMPORTANCE.includes(r.level as EventImportance)) return undefined;
  return {
    level: r.level as EventImportance,
    reason: typeof r.reason === 'string' ? r.reason : '',
  };
}

export async function POST(request: NextRequest) {
  let url: string;

  try {
    const body = await request.json();
    url = body.url;
    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'Укажите корректный URL' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  let pageText = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json(
        { error: `Не удалось загрузить страницу: HTTP ${res.status}` },
        { status: 400 }
      );
    }

    const html = await res.text();
    pageText = extractText(html).slice(0, 8000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    const isTimeout = msg.includes('abort') || msg.includes('AbortError');
    return Response.json(
      { error: isTimeout ? 'Страница не ответила (таймаут 15 с)' : `Ошибка загрузки: ${msg}` },
      { status: 400 }
    );
  }

  const hints = preclassifySource(url);

  const domainRulesBlock = hints.forcedCategory
    ? `
ПРЕДВАРИТЕЛЬНАЯ КЛАССИФИКАЦИЯ (ПРИОРИТЕТ — НЕ ПЕРЕОПРЕДЕЛЯТЬ):
- Источник: ${hints.sourceKind ?? hints.forcedCategory}
- category ОБЯЗАН быть: ${hints.forcedCategory}
- Причина: ${hints.reason ?? ''}
${hints.forcedMinimumImpact ? `- avangardImpact.level НЕ МОЖЕТ быть ниже ${hints.forcedMinimumImpact}` : ''}
Это системное правило. Не переопределяй категорию без явного противоречия в тексте.
`
    : '';

  const prompt = `Роль: внутренний аналитик компании Авангард. Профессиональная экипировка. Твои выводы используются для стратегических и продуктовых решений руководства.

ПРОФИЛЬ АВАНГАРДА:
${formatCompanyContext()}
${domainRulesBlock}
Задача: проанализировать страницу и вернуть ТОЛЬКО валидный JSON без пояснений.

URL: ${url}

Содержимое:
${pageText}

ЭТАЛОН КАЧЕСТВА (запомни разницу):

whatHappened
  ✗ "Министерство приняло важное решение в сфере охраны труда..."
  ✓ "Минтруд, приказ №123 от 12.05.2025. С 01.01.2026 — обязателен тип A для высоты >5 м."

whyItMattersForAvangard
  ✗ "Это может повлиять на рынок спецодежды"
  ✓ "Новый ГОСТ напрямую затрагивает огнестойкую спецодежду — ключевое направление Авангарда. Производители без новой сертификации выпадают из тендеров нефтегазовых компаний."

opportunities
  ✗ "Расширение клиентской базы за счёт новых предприятий"
  ✓ "Дорожные подрядчики ЦФО: предложить замену жилетов до апреля (~4 000 шт. у топ-50)"

threats
  ✗ "Конкурентное давление может усилиться"
  ✓ "Восток-Сервис: уже подал заявку на сертификацию → при выходе на 2 мес. раньше займёт дорожников на 2–3 года"

JSON:
{
  "title": "Фактический заголовок-label события, до 80 символов",
  "category": "news | tender | competitor | regulation | other",
  "importance": "рыночная важность события: critical | high | medium | low",
  "avangardImpact": {
    "level": "влияние именно на Авангард: critical | high | medium | low",
    "reason": "одно предложение: почему именно для Авангарда — через его продукты, отрасли клиентов или конкурентов"
  },
  "sourceType": "новостной портал | сайт конкурента | тендерный портал | госпортал | отраслевое издание | соцсети",
  "summary": "что это значит для Авангарда — 1 предложение, не пересказ заголовка",
  "whatHappened": "Факты: цифры, НПА, названия, объёмы, сроки. Никаких вводных слов и нарратива.",
  "whyItMattersForAvangard": "Структурный сдвиг через призму Авангарда: что меняется в его конкурентной позиции, спросе на его продукты или производственных условиях. Не пересказывать whatHappened.",
  "consequences": ["Измеримое последствие для Авангарда или его ключевых сегментов в горизонте 6 мес."],
  "signals": ["Ранний, ещё неподтверждённый индикатор тренда — стоит отслеживать"],
  "opportunities": ["[Сегмент/направление Авангарда]: действие + временное окно или объём"],
  "threats": ["[Актор/фактор]: механизм угрозы для Авангарда + масштаб или срок"],
  "suggestedAction": "Роль в Авангарде + конкретное действие + измеримый результат за 2 недели",
  "competitorName": "название конкурента если category=competitor, иначе null",
  "evidence": {
    "whyItMattersForAvangard": {
      "quotes": ["дословный фрагмент или число из текста страницы"],
      "interpretation": "что AI вывел сверх этих фактов — одним предложением"
    },
    "opportunities": [{"quotes": ["факт/цитата из текста"], "interpretation": "вывод AI"}],
    "threats": [{"quotes": ["факт/цитата из текста"], "interpretation": "вывод AI"}],
    "suggestedAction": {"quotes": ["факт, обосновывающий рекомендацию"], "interpretation": "логика — одним предложением"}
  }
}

evidence-правила (соблюдать строго):
- quotes — только дословно из текста страницы. Не перефразировать. Если факта нет — []. Максимум 3. Одно предложение.
- interpretation — одно предложение: вывод AI сверх фактов.
- evidence.opportunities и evidence.threats — та же длина, что и соответствующие массивы.

importance (рыночная важность события):
- critical: изменения ГОСТ/ТР ТС/ЕАЭС, сертификация СИЗ, импортные/санкционные ограничения
- high: новые материалы (мембраны, огнестойкие, антистатика), технологии производства, стратегические действия крупнейших конкурентов
- medium: новые продуктовые линейки, крупные тендеры, новые заводы/поставщики, партнёрства
- low: общие отраслевые новости, маркетинговые публикации, пресс-релизы без практической ценности

avangardImpact.level (влияние на Авангард — независимо от рыночной важности):
- critical: напрямую затрагивает производство, сертификацию или ключевые продуктовые линейки Авангарда
- high: значимая возможность или угроза для доли рынка Авангарда в его ключевых отраслях
- medium: косвенное влияние через клиентские отрасли или конкурентную расстановку
- low: фоновый сигнал, минимальная связь с позицией Авангарда

ПРАВИЛО ДЛЯ ТЕНДЕРОВ:
Если category=tender, но страница является главной страницей тендерной площадки без конкретного лота, НМЦ, заказчика или срока подачи — avangardImpact.level НЕ ВЫШЕ medium.

category:
- news: рыночные/отраслевые новости  tender: тендеры, госзакупки
- competitor: активность конкурентов  regulation: нормативы, стандарты, законодательство
- other: прочее

ЗАПРЕТ ОБЩИХ ФОРМУЛИРОВОК:
whyItMattersForAvangard ОБЯЗАН содержать хотя бы одно из:
  • конкретный продукт Авангарда (спецодежда, защитная обувь, СИЗ, жилеты и т.п.)
  • конкретный материал (мембрана, арамид, антистатика и т.п.)
  • конкретную технологию производства
  • конкретную отрасль клиентов (нефтяная, металлургия, строительство и т.п.)
  • имя конкурента из профиля
  • номер НПА или ГОСТа
Если ни одного конкретного элемента найти невозможно, напиши ровно:
"Недостаточно данных для конкретного вывода по Авангарду."
Запрещено: "это важно для компании", "может повлиять на бизнес", "стоит обратить внимание", "рынок спецодежды" без уточнения.`;

  try {
    const result = await callGemini(prompt, true);
    const parsed = JSON.parse(result);

    // Post-processing: apply domain rules over Gemini output
    const category: EventCategory = hints.forcedCategory
      ?? (VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'other');

    const importance: EventImportance = VALID_IMPORTANCE.includes(parsed.importance)
      ? parsed.importance
      : 'medium';

    let avangardImpact = parseAvangardImpact(parsed.avangardImpact);
    if (hints.forcedMinimumImpact && avangardImpact) {
      const minIdx = IMPACT_ORDER.indexOf(hints.forcedMinimumImpact);
      const curIdx = IMPACT_ORDER.indexOf(avangardImpact.level);
      if (curIdx < minIdx) {
        avangardImpact = {
          level: hints.forcedMinimumImpact,
          reason: avangardImpact.reason
            ? `${avangardImpact.reason} [уровень повышен по domain rule: ${hints.reason}]`
            : `Повышено по domain rule: ${hints.reason}`,
        };
      }
    } else if (hints.forcedMinimumImpact && !avangardImpact) {
      avangardImpact = {
        level: hints.forcedMinimumImpact,
        reason: `Установлено по domain rule: ${hints.reason}`,
      };
    }

    // Cap tender impact at medium when page has no specific lot data
    const TENDER_SPECIFIC_MARKERS = /НМЦ|лот\b|заказчик|срок подач|рублей|млн|тыс\.|№\s*\d|извещени/i;
    if (
      category === 'tender' &&
      avangardImpact &&
      (avangardImpact.level === 'critical' || avangardImpact.level === 'high') &&
      !TENDER_SPECIFIC_MARKERS.test(parsed.whatHappened ?? '')
    ) {
      avangardImpact = {
        level: 'medium',
        reason: avangardImpact.reason
          ? `${avangardImpact.reason} [снижено до medium: страница без конкретного лота, НМЦ или заказчика]`
          : 'Страница тендерной площадки без конкретного лота — impact не выше medium.',
      };
    }

    return Response.json({
      id: crypto.randomUUID(),
      url,
      title: String(parsed.title ?? 'Без заголовка').slice(0, 200),
      category,
      summary: String(parsed.summary ?? ''),
      signals: Array.isArray(parsed.signals) ? parsed.signals.map(String) : [],
      date: new Date().toISOString(),
      markedForBrief: false,
      importance,
      avangardImpact,
      sourceType: parsed.sourceType ? String(parsed.sourceType) : undefined,
      whatHappened: parsed.whatHappened ? String(parsed.whatHappened) : undefined,
      whyItMattersForAvangard: parsed.whyItMattersForAvangard
        ? String(parsed.whyItMattersForAvangard)
        : undefined,
      consequences: Array.isArray(parsed.consequences)
        ? parsed.consequences.map(String)
        : undefined,
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map(String)
        : undefined,
      threats: Array.isArray(parsed.threats) ? parsed.threats.map(String) : undefined,
      suggestedAction: parsed.suggestedAction ? String(parsed.suggestedAction) : undefined,
      competitorName:
        parsed.competitorName && parsed.competitorName !== 'null'
          ? String(parsed.competitorName)
          : null,
      evidence: parseEvidence(parsed.evidence),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return Response.json({ error: `Ошибка анализа: ${msg}` }, { status: 500 });
  }
}
