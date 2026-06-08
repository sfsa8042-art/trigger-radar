import { type NextRequest } from 'next/server';
import type { Source } from '@/lib/types';

// ── Stage 1: positive keywords (initial gate) ────────────────────────────────
const POSITIVE_KEYWORDS = [
  'спецодежда', 'спецобувь', 'сиз', 'гост', 'тр тс', 'сертификац',
  'тендер', 'закупк', 'мембран', 'антистат', 'огнестойк',
  'производств', 'ткань', 'защитная одежда', 'ppe', 'workwear', 'safety shoe',
];

// ── Stage 2: negative keywords (checked against title only) ──────────────────
const NEGATIVE_KEYWORDS = [
  'календарь', 'исполнительное производство', 'алименты', 'банкротство',
  'налоги', 'отпуск', 'зарплата', 'пенсия', 'бухгалтерия',
  'ндфл', 'кадры', 'трудовая книжка',
];

// ── Stage 3: weighted scoring ─────────────────────────────────────────────────
const SCORE_RULES: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /спецодежда/i,      points: 5 },
  { pattern: /\bсиз\b/i,         points: 5 },
  { pattern: /спецобувь/i,       points: 5 },
  { pattern: /\bгост\b/i,        points: 4 },
  { pattern: /тр\s*тс/i,         points: 4 },
  { pattern: /антистат/i,        points: 4 },
  { pattern: /огнестойк/i,       points: 4 },
  { pattern: /мембран/i,         points: 4 },
  { pattern: /тендер/i,          points: 3 },
  { pattern: /закупк/i,          points: 3 },
  // производство + СИЗ в одной строке — бонус
  { pattern: /производств.*сиз|сиз.*производств/i, points: 3 },
];

// Thresholds
const SCORE_THRESHOLD_DEFAULT    = 3;
const SCORE_THRESHOLD_COMPETITOR = 2; // lower bar for competitor sources

const MAX_SOURCES    = 10;
const MAX_CANDIDATES = 20;

interface RawCandidate {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  reason: string;
  relevanceScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (!rawHref || rawHref.startsWith('javascript') || rawHref.startsWith('mailto') || rawHref.startsWith('#')) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    try {
      const href = new URL(rawHref, baseUrl).href;
      links.push({ href, text });
    } catch {
      // skip malformed URLs
    }
  }
  return links;
}

/** Stage 1: at least one positive keyword in href or title */
function firstMatchedKeyword(href: string, text: string): string | null {
  const combined = (href + ' ' + text).toLowerCase();
  for (const kw of POSITIVE_KEYWORDS) {
    if (combined.includes(kw)) return kw;
  }
  return null;
}

/** Stage 2: any negative keyword in title → discard */
function isNegative(title: string): boolean {
  const lower = title.toLowerCase();
  return NEGATIVE_KEYWORDS.some(nk => lower.includes(nk));
}

/** Stage 3: sum of all matching score rules against href + title */
function calcScore(href: string, title: string): number {
  const combined = href + ' ' + title;
  return SCORE_RULES.reduce((sum, rule) => sum + (rule.pattern.test(combined) ? rule.points : 0), 0);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let sources: Source[];
  let existingUrls: string[];

  try {
    const body = await request.json();
    sources = Array.isArray(body.sources) ? body.sources : [];
    existingUrls = Array.isArray(body.existingUrls) ? body.existingUrls : [];
  } catch {
    return Response.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const activeSources = sources.filter(s => s.active).slice(0, MAX_SOURCES);
  const existingSet   = new Set(existingUrls);
  const seenUrls      = new Set<string>();
  const candidates: RawCandidate[] = [];

  let totalLinks     = 0;
  let passedStage1   = 0;   // survived positive keyword check
  let passedStage2   = 0;   // survived negative keyword check
  let passedStage3   = 0;   // survived score threshold (= final candidates)
  let sourcesScanned = 0;

  for (const source of activeSources) {
    if (candidates.length >= MAX_CANDIDATES) break;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      });

      clearTimeout(timeout);
      if (!res.ok) continue;

      const html = await res.text();
      sourcesScanned++;

      const links = extractLinks(html, source.url);
      totalLinks += links.length;

      const scoreThreshold = source.type === 'competitor'
        ? SCORE_THRESHOLD_COMPETITOR
        : SCORE_THRESHOLD_DEFAULT;

      for (const { href, text } of links) {
        if (candidates.length >= MAX_CANDIDATES) break;
        if (seenUrls.has(href) || existingSet.has(href)) continue;

        // Stage 1: positive keyword gate
        const kw = firstMatchedKeyword(href, text);
        if (!kw) continue;
        passedStage1++;

        // Stage 2: negative keyword filter (title only)
        if (isNegative(text)) continue;
        passedStage2++;

        // Stage 3: relevance score threshold
        const score = calcScore(href, text);
        if (score < scoreThreshold) continue;
        passedStage3++;

        seenUrls.add(href);
        candidates.push({
          sourceId: source.id,
          sourceName: source.name,
          url: href,
          title: text || href,
          reason: `Совпадение: «${kw}»`,
          relevanceScore: score,
        });
      }
    } catch {
      // skip failed sources silently
    }
  }

  return Response.json({
    candidates,
    stats: {
      sourcesScanned,
      totalLinks,
      filtered: passedStage3,
      debug: { passedStage1, passedStage2, passedStage3 },
    },
  });
}
