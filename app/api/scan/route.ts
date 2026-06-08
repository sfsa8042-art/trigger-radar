import { type NextRequest } from 'next/server';
import type { Source } from '@/lib/types';

// ── Stage 1: positive keywords (initial gate) ────────────────────────────────
const POSITIVE_KEYWORDS = [
  'спецодежда', 'спецобувь', 'сиз', 'гост', 'тр тс', 'сертификац',
  'тендер', 'закупк', 'мембран', 'антистат', 'огнестойк',
  'производств', 'ткань', 'защитная одежда', 'ppe', 'workwear', 'safety shoe',
];

// ── Stage 2a: negative title keywords ────────────────────────────────────────
const NEGATIVE_TITLE_KEYWORDS = [
  'календарь', 'исполнительное производство', 'алименты', 'банкротство',
  'налоги', 'отпуск', 'зарплата', 'пенсия', 'бухгалтерия',
  'ндфл', 'кадры', 'трудовая книжка',
  'медицинск', 'фармацевт',
];

// ── Stage 2b: negative URL patterns ──────────────────────────────────────────
const NEGATIVE_URL_PATTERNS = [/_all($|[/?#])/i, /spetsodezhda_all/i, /specobuv_all/i];

// ── Stage 3: weighted scoring ─────────────────────────────────────────────────
const SCORE_RULES: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /спецодежда/i,                            points: 5 },
  { pattern: /\bсиз\b/i,                               points: 5 },
  { pattern: /спецобувь/i,                             points: 5 },
  { pattern: /\bгост\b/i,                              points: 4 },
  { pattern: /тр\s*тс/i,                               points: 4 },
  { pattern: /антистат/i,                              points: 4 },
  { pattern: /огнестойк/i,                             points: 4 },
  { pattern: /мембран/i,                               points: 4 },
  { pattern: /тендер/i,                                points: 3 },
  { pattern: /закупк/i,                                points: 3 },
  { pattern: /производств.*сиз|сиз.*производств/i,     points: 3 },
];

const SCORE_THRESHOLD_DEFAULT    = 3;
const SCORE_THRESHOLD_COMPETITOR = 2;
const MAX_PER_SOURCE             = 5;
const MAX_SOURCES                = 10;
const MAX_CANDIDATES             = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawCandidate {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  reason: string;
  relevanceScore: number;
}

export interface SourceScanStat {
  sourceName: string;
  extractedLinks: number;
  positiveMatches: number;
  afterNegativeFilter: number;
  finalCandidates: number;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (
      !rawHref ||
      rawHref.startsWith('javascript') ||
      rawHref.startsWith('mailto') ||
      rawHref.startsWith('#')
    ) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    try {
      const href = new URL(rawHref, baseUrl).href;
      links.push({ href, text });
    } catch { /* skip malformed */ }
  }
  return links;
}

function firstMatchedKeyword(href: string, text: string): string | null {
  const combined = (href + ' ' + text).toLowerCase();
  for (const kw of POSITIVE_KEYWORDS) {
    if (combined.includes(kw)) return kw;
  }
  return null;
}

function hasNegativeTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return NEGATIVE_TITLE_KEYWORDS.some(nk => lower.includes(nk));
}

function hasNegativeUrl(href: string): boolean {
  return NEGATIVE_URL_PATTERNS.some(p => p.test(href));
}

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
    sources      = Array.isArray(body.sources)      ? body.sources      : [];
    existingUrls = Array.isArray(body.existingUrls) ? body.existingUrls : [];
  } catch {
    return Response.json({ error: 'Некорректное тело запроса' }, { status: 400 });
  }

  const activeSources  = sources.filter(s => s.active).slice(0, MAX_SOURCES);
  const existingSet    = new Set(existingUrls);
  const seenUrls       = new Set<string>();
  const allCandidates: RawCandidate[] = [];
  const perSourceStats: SourceScanStat[] = [];

  let totalLinksGlobal = 0;

  for (const source of activeSources) {
    if (allCandidates.length >= MAX_CANDIDATES) break;

    const stat: SourceScanStat = {
      sourceName:          source.name,
      extractedLinks:      0,
      positiveMatches:     0,
      afterNegativeFilter: 0,
      finalCandidates:     0,
    };
    perSourceStats.push(stat);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:             'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language':  'ru-RU,ru;q=0.9,en;q=0.8',
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        stat.error = `HTTP ${res.status}`;
        continue;
      }

      const html = await res.text();
      const links = extractLinks(html, source.url);
      stat.extractedLinks = links.length;
      totalLinksGlobal   += links.length;

      const scoreThreshold = source.type === 'competitor'
        ? SCORE_THRESHOLD_COMPETITOR
        : SCORE_THRESHOLD_DEFAULT;

      // Collect all passing candidates for this source (no global limit yet)
      const sourceCandidates: RawCandidate[] = [];
      const sourceSeen = new Set<string>(); // dedup within this source's link list

      for (const { href, text } of links) {
        if (seenUrls.has(href) || existingSet.has(href) || sourceSeen.has(href)) continue;
        sourceSeen.add(href);

        // Stage 1: positive keyword
        const kw = firstMatchedKeyword(href, text);
        if (!kw) continue;
        stat.positiveMatches++;

        // Stage 2a: negative title
        if (hasNegativeTitle(text)) continue;
        // Stage 2b: negative URL pattern
        if (hasNegativeUrl(href)) continue;
        stat.afterNegativeFilter++;

        // Stage 3: relevance score
        const score = calcScore(href, text);
        if (score < scoreThreshold) continue;

        sourceCandidates.push({
          sourceId:       source.id,
          sourceName:     source.name,
          url:            href,
          title:          text || href,
          reason:         `Совпадение: «${kw}»`,
          relevanceScore: score,
        });
      }

      // Sort by score desc, take top MAX_PER_SOURCE
      sourceCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const top = sourceCandidates.slice(0, MAX_PER_SOURCE);

      // Register URLs as seen (all that passed, not just top-5, to avoid re-evaluation from other sources)
      for (const c of sourceCandidates) seenUrls.add(c.url);

      // Add top-N to global candidates, respecting global cap
      const slotsLeft = MAX_CANDIDATES - allCandidates.length;
      const toAdd = top.slice(0, slotsLeft);
      allCandidates.push(...toAdd);
      stat.finalCandidates = toAdd.length;

    } catch (err) {
      stat.error = err instanceof Error ? err.message.slice(0, 80) : 'Ошибка сети';
    }
  }

  return Response.json({
    candidates: allCandidates,
    stats: {
      sourcesScanned: perSourceStats.filter(s => !s.error && s.extractedLinks > 0).length,
      totalLinks:     totalLinksGlobal,
      filtered:       allCandidates.length,
      perSource:      perSourceStats,
    },
  });
}
