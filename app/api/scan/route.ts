import { type NextRequest } from 'next/server';
import type { Source } from '@/lib/types';

const KEYWORDS = [
  'спецодежда', 'спецобувь', 'сиз', 'гост', 'тр тс', 'сертификац',
  'тендер', 'закупк', 'мембран', 'антистат', 'огнестойк',
  'производств', 'ткань', 'защитная одежда', 'ppe', 'workwear', 'safety shoe',
];

const MAX_SOURCES = 10;
const MAX_CANDIDATES = 20;

interface RawCandidate {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  reason: string;
}

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

function matchedKeyword(href: string, text: string): string | null {
  const combined = (href + ' ' + text).toLowerCase();
  for (const kw of KEYWORDS) {
    if (combined.includes(kw)) return kw;
  }
  return null;
}

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
  const existingSet = new Set(existingUrls);
  const seenUrls = new Set<string>();
  const candidates: RawCandidate[] = [];

  let totalLinks = 0;
  let filtered = 0;
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

      for (const { href, text } of links) {
        if (candidates.length >= MAX_CANDIDATES) break;
        if (seenUrls.has(href) || existingSet.has(href)) continue;

        const kw = matchedKeyword(href, text);
        if (!kw) continue;

        filtered++;
        seenUrls.add(href);
        candidates.push({
          sourceId: source.id,
          sourceName: source.name,
          url: href,
          title: text || href,
          reason: `Совпадение: «${kw}»`,
        });
      }
    } catch {
      // skip failed sources silently
    }
  }

  return Response.json({
    candidates,
    stats: { sourcesScanned, totalLinks, filtered },
  });
}
