'use client';

import type { TriggerEvent, AvangardDirection, EventCategory } from '@/lib/types';

// ── Trend dictionary ──────────────────────────────────────────────────────────

interface TrendDefinition {
  key: string;
  name: string;
  textPatterns: RegExp;
  directions: AvangardDirection[];
  categories: EventCategory[];
  isMaterialTech: boolean;
}

const TREND_DEFINITIONS: TrendDefinition[] = [
  {
    key: 'antistatic',
    name: 'Антистатика',
    textPatterns: /антистат/i,
    directions: ['antistatic'],
    categories: ['news', 'competitor', 'regulation'],
    isMaterialTech: true,
  },
  {
    key: 'membranes',
    name: 'Мембранные ткани',
    textPatterns: /мембран/i,
    directions: ['membranes'],
    categories: ['news', 'competitor'],
    isMaterialTech: true,
  },
  {
    key: 'flame-resistant',
    name: 'Огнестойкая одежда',
    textPatterns: /огнестойк|огнезащ|flame.resistant/i,
    directions: ['flame-resistant'],
    categories: ['news', 'competitor', 'regulation'],
    isMaterialTech: true,
  },
  {
    key: 'footwear',
    name: 'Спецобувь',
    textPatterns: /спецобув|safety shoe|защитная обув/i,
    directions: ['footwear'],
    categories: ['news', 'competitor', 'tender'],
    isMaterialTech: false,
  },
  {
    key: 'ppe',
    name: 'СИЗ',
    textPatterns: /\bсиз\b|средства.*защит|защитн.*средств/i,
    directions: ['ppe'],
    categories: ['news', 'competitor', 'tender', 'regulation'],
    isMaterialTech: false,
  },
  {
    key: 'oil-gas',
    name: 'Нефтегаз',
    textPatterns: /нефтегаз|нефт[её].*газ|oil.gas|нефтян|газовик/i,
    directions: ['oil-gas'],
    categories: ['news', 'competitor', 'tender'],
    isMaterialTech: false,
  },
  {
    key: 'metallurgy',
    name: 'Металлургия',
    textPatterns: /металлург|сталевар|доменн|литейн/i,
    directions: ['metallurgy'],
    categories: ['news', 'tender'],
    isMaterialTech: false,
  },
  {
    key: 'construction',
    name: 'Строительство',
    textPatterns: /строительств|стройк|монтажник|высотн.*работ/i,
    directions: ['construction'],
    categories: ['news', 'tender'],
    isMaterialTech: false,
  },
  {
    key: 'energy',
    name: 'Энергетика',
    textPatterns: /энергетик|электростанц|тепловы.*станц|атомн.*станц/i,
    directions: ['energy'],
    categories: ['news', 'tender'],
    isMaterialTech: false,
  },
  {
    key: 'import-substitution',
    name: 'Импортозамещение',
    textPatterns: /импортозамещ|локализац|реестр.*минпром|отечественн.*производ/i,
    directions: ['workwear', 'ppe', 'footwear'],
    categories: ['news', 'regulation'],
    isMaterialTech: false,
  },
  {
    key: 'certification',
    name: 'Сертификация',
    textPatterns: /сертифик|гост\b|\bтр\s*тс\b|соответстви.*требован|аттестац/i,
    directions: ['workwear', 'ppe', 'footwear', 'flame-resistant', 'antistatic'],
    categories: ['regulation', 'news'],
    isMaterialTech: false,
  },
  {
    key: 'tenders',
    name: 'Тендеры',
    textPatterns: /тендер|закупк|нмц|госзакупк|контракт.*поставк/i,
    directions: ['workwear', 'ppe', 'footwear'],
    categories: ['tender'],
    isMaterialTech: false,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendProfile {
  key: string;
  name: string;
  isMaterialTech: boolean;
  events: TriggerEvent[];
  eventCount: number;
  sourceCount: number;
  competitorCount: number;
  recentCount: number;
  latestDate: string;
  trendStrength: number;
  isCompetitorDriven: boolean;
  isRegulationDriven: boolean;
  relatedDirections: AvangardDirection[];
  topSources: string[];
  relatedCompetitors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

function matchEvent(event: TriggerEvent, def: TrendDefinition): boolean {
  const haystack = [
    event.title,
    event.summary,
    event.whatHappened ?? '',
    event.whyItMattersForAvangard ?? '',
    event.whyItMattersForWorkwear ?? '',
  ].join(' ');

  // 1. Text match
  if (def.textPatterns.test(haystack)) return true;

  // 2. competitorIntel.overlap intersection
  if (event.competitorIntel?.overlap.some(d => def.directions.includes(d))) return true;

  // 3. businessImpact — any dim that maps to a matching direction
  // For now: if event has any non-none businessImpact and shares a direction
  if (event.businessImpact && def.directions.length > 0) {
    const impactKeys = Object.keys(event.businessImpact) as Array<keyof typeof event.businessImpact>;
    if (impactKeys.some(k => event.businessImpact![k] && event.businessImpact![k] !== 'none')) {
      // Only accept if at least one direction is relevant to the trend via category hint
      if (def.categories.includes(event.category)) return true;
    }
  }

  return false;
}

const IMPACT_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function buildTrendProfiles(events: TriggerEvent[]): TrendProfile[] {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 86_400_000;

  return TREND_DEFINITIONS.map(def => {
    const matched = events.filter(e => matchEvent(e, def));
    if (matched.length === 0) return null;

    const sorted = [...matched].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const domains = matched.map(e => extractDomain(e.url));
    const uniqueDomains = [...new Set(domains)];
    const uniqueCompetitors = [
      ...new Set(
        matched
          .filter(e => e.category === 'competitor' && e.competitorName)
          .map(e => e.competitorName!)
      ),
    ];
    const recentCount = matched.filter(
      e => now - new Date(e.date).getTime() < THIRTY_DAYS
    ).length;

    const isCompetitorDriven = matched.some(e => e.category === 'competitor');
    const isRegulationDriven = matched.some(e => e.category === 'regulation');

    // Union of directions from events
    const dirSet = new Set<AvangardDirection>(def.directions);
    for (const e of matched) {
      for (const d of e.competitorIntel?.overlap ?? []) dirSet.add(d);
    }

    // Top 3 sources by frequency
    const domainFreq = new Map<string, number>();
    for (const d of domains) domainFreq.set(d, (domainFreq.get(d) ?? 0) + 1);
    const topSources = [...domainFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);

    const trendStrength =
      matched.length +
      uniqueDomains.length * 2 +
      uniqueCompetitors.length * 3 +
      recentCount * 2 +
      (isCompetitorDriven ? 2 : 0) +
      (isRegulationDriven ? 1 : 0);

    return {
      key:               def.key,
      name:              def.name,
      isMaterialTech:    def.isMaterialTech,
      events:            sorted,
      eventCount:        matched.length,
      sourceCount:       uniqueDomains.length,
      competitorCount:   uniqueCompetitors.length,
      recentCount,
      latestDate:        sorted[0].date,
      trendStrength,
      isCompetitorDriven,
      isRegulationDriven,
      relatedDirections: [...dirSet],
      topSources,
      relatedCompetitors: uniqueCompetitors,
    };
  }).filter((p): p is TrendProfile => p !== null);
}

function getRecommendedWatch(profile: TrendProfile): string {
  if (profile.isCompetitorDriven)
    return 'Следить за действиями конкурентов в этом направлении.';
  if (profile.isRegulationDriven)
    return 'Проверить влияние на сертификацию, ассортимент и документы Авангарда.';
  if (profile.isMaterialTech)
    return 'Оценить применимость в продуктовой линейке и закупках материалов.';
  return 'Продолжить наблюдение за динамикой сигналов.';
}

// ── Strength badge ────────────────────────────────────────────────────────────

function strengthBadge(s: number): { label: string; cls: string } {
  if (s >= 15) return { label: `⚡ ${s}`, cls: 'bg-red-100 text-red-700 border border-red-200' };
  if (s >= 8)  return { label: `▲ ${s}`, cls: 'bg-orange-100 text-orange-700 border border-orange-100' };
  if (s >= 4)  return { label: `◆ ${s}`, cls: 'bg-yellow-50 text-yellow-700 border border-yellow-100' };
  return         { label: `· ${s}`, cls: 'bg-gray-100 text-gray-500 border border-gray-200' };
}

const DIR_LABEL: Partial<Record<AvangardDirection, string>> = {
  workwear: 'Спецодежда', footwear: 'Спецобувь', ppe: 'СИЗ',
  'hi-vis': 'Сигнальная', 'flame-resistant': 'Огнестойкость',
  antistatic: 'Антистатика', membranes: 'Мембраны',
  'oil-gas': 'Нефтегаз', metallurgy: 'Металлургия',
  construction: 'Строительство', chemicals: 'Химия', energy: 'Энергетика',
};

// ── TrendCard ─────────────────────────────────────────────────────────────────

function TrendCard({ profile }: { profile: TrendProfile }) {
  const badge = strengthBadge(profile.trendStrength);
  const recentEvents = profile.events.slice(0, 3);
  const recommendation = getRecommendedWatch(profile);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">{profile.name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>{profile.eventCount} {profile.eventCount === 1 ? 'событие' : profile.eventCount < 5 ? 'события' : 'событий'}</span>
        {profile.sourceCount > 0 && <span>{profile.sourceCount} источн.</span>}
        {profile.competitorCount > 0 && <span>{profile.competitorCount} конкур.</span>}
        {profile.recentCount > 0 && (
          <span className="text-emerald-500 font-medium">+{profile.recentCount} за 30д</span>
        )}
      </div>

      {/* Direction tags */}
      {profile.relatedDirections.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.relatedDirections.slice(0, 4).map(d => (
            <span key={d} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
              {DIR_LABEL[d] ?? d}
            </span>
          ))}
          {profile.relatedDirections.length > 4 && (
            <span className="text-[10px] text-gray-400">+{profile.relatedDirections.length - 4}</span>
          )}
        </div>
      )}

      {/* Top sources */}
      {profile.topSources.length > 0 && (
        <div className="text-[11px] text-gray-400">
          <span className="font-medium text-gray-500">Источники: </span>
          {profile.topSources.join(' · ')}
        </div>
      )}

      {/* Related competitors */}
      {profile.relatedCompetitors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.relatedCompetitors.map(c => (
            <span key={c} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Last 3 events */}
      <div className="space-y-1.5 border-t border-gray-50 pt-2.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Последние события</p>
        {recentEvents.map(e => {
          const date = new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
          const level = e.avangardImpact?.level ?? e.importance ?? 'low';
          const dotCls: Record<string, string> = {
            critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
          };
          return (
            <div key={e.id} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${dotCls[level] ?? 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-700 leading-snug line-clamp-1">{e.title}</p>
                <p className="text-[10px] text-gray-400">{date} · {extractDomain(e.url)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommended watch */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-0.5">Рекомендованное наблюдение</p>
        <p className="text-[11px] text-blue-700 leading-snug">{recommendation}</p>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function TrendSection({
  title,
  profiles,
  emptyLabel,
}: {
  title: string;
  profiles: TrendProfile[];
  emptyLabel?: string;
}) {
  if (profiles.length === 0) {
    if (!emptyLabel) return null;
    return (
      <div className="mb-8">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</p>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">
          {profiles.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {profiles.map(p => <TrendCard key={p.key} profile={p} />)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TrendEngineProps {
  events: TriggerEvent[]; // already filtered to active only by parent
}

export default function TrendEngine({ events }: TrendEngineProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Недостаточно данных для трендов</p>
        <p className="text-xs text-gray-400">Проанализируйте несколько URL — тренды формируются автоматически</p>
      </div>
    );
  }

  const allProfiles = buildTrendProfiles(events);

  const topTrends        = [...allProfiles].sort((a, b) => b.trendStrength - a.trendStrength).slice(0, 5);
  const growingTrends    = allProfiles.filter(p => p.recentCount > 0)
                            .sort((a, b) => b.recentCount - a.recentCount || new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  const competitorTrends = allProfiles.filter(p => p.isCompetitorDriven)
                            .sort((a, b) => b.competitorCount - a.competitorCount);
  const regulationTrends = allProfiles.filter(p => p.isRegulationDriven);

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Трендов выявлено',   val: allProfiles.length,                   cls: 'text-gray-700' },
          { label: 'Растущих',           val: growingTrends.length,                 cls: growingTrends.length > 0 ? 'text-emerald-600' : 'text-gray-400' },
          { label: 'Конкурентных',       val: competitorTrends.length,              cls: competitorTrends.length > 0 ? 'text-orange-600' : 'text-gray-400' },
          { label: 'Регуляторных',       val: regulationTrends.length,              cls: regulationTrends.length > 0 ? 'text-purple-600' : 'text-gray-400' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-[110px] text-center">
            <p className={`text-xl font-bold ${cls}`}>{val}</p>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
          </div>
        ))}
      </div>

      <TrendSection title="Top Trends" profiles={topTrends} />
      <TrendSection
        title="Growing Trends"
        profiles={growingTrends}
        emptyLabel="Нет трендов с активностью за последние 30 дней."
      />
      <TrendSection
        title="Competitor-driven Trends"
        profiles={competitorTrends}
        emptyLabel="Нет конкурентных трендов."
      />
      <TrendSection
        title="Regulation-driven Trends"
        profiles={regulationTrends}
        emptyLabel="Нет регуляторных трендов."
      />
    </div>
  );
}
