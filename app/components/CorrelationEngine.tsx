'use client';

import type { TriggerEvent, AvangardDirection, EventImportance } from '@/lib/types';

// ── Direction detection ────────────────────────────────────────────────────────

const DIR_PATTERNS: Array<{ dir: AvangardDirection; pattern: RegExp }> = [
  { dir: 'membranes',       pattern: /мембран/i },
  { dir: 'flame-resistant', pattern: /огнестойк|огнезащ|flame.resistant/i },
  { dir: 'antistatic',      pattern: /антистат/i },
  { dir: 'oil-gas',         pattern: /нефтегаз|нефт[её].*газ|нефтян|газовик/i },
  { dir: 'metallurgy',      pattern: /металлург|сталевар|литейн/i },
  { dir: 'footwear',        pattern: /спецобув|защитная обув/i },
  { dir: 'ppe',             pattern: /\bсиз\b|средства.*защит/i },
  { dir: 'construction',    pattern: /строительств|монтажник/i },
  { dir: 'energy',          pattern: /энергетик|электростанц/i },
  { dir: 'workwear',        pattern: /спецодежд/i },
  { dir: 'chemicals',       pattern: /химическ|химзащит/i },
  { dir: 'hi-vis',          pattern: /сигнальн.*одежд|световозвращ/i },
];

function getEventDirections(event: TriggerEvent): AvangardDirection[] {
  const dirs = new Set<AvangardDirection>(event.competitorIntel?.overlap ?? []);
  const text = [event.title, event.summary, event.whatHappened ?? ''].join(' ');
  for (const { dir, pattern } of DIR_PATTERNS) {
    if (pattern.test(text)) dirs.add(dir);
  }
  return [...dirs];
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type CorrelationType = 'same_competitor' | 'same_technology' | 'regulatory_amplifies';

export interface SignalCluster {
  id: string;
  label: string;
  correlationType: CorrelationType;
  events: TriggerEvent[];
  strength: number;
  maxImportance: EventImportance;
  sharedDimension: string;
  insight: string;
  isHot: boolean;
  uniqueCategories: string[];
}

// ── Scoring ────────────────────────────────────────────────────────────────────

const IMPACT_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function calcStrength(events: TriggerEvent[]): number {
  const THIRTY_DAYS = 30 * 86_400_000;
  const now = Date.now();
  const eventScore = events.length * 15;
  const uniqueDomains = new Set(events.map(e => extractDomain(e.url))).size;
  const sourceScore = uniqueDomains * 10;
  const uniqueCats = new Set(events.map(e => e.category)).size;
  const crossCatScore = uniqueCats * 20;
  const recentCount = events.filter(e => now - new Date(e.date).getTime() < THIRTY_DAYS).length;
  const hotScore = recentCount > 0 ? 20 : 0;
  const maxImp = Math.max(...events.map(e => IMPACT_ORDER[e.avangardImpact?.level ?? e.importance ?? 'low'] ?? 1));
  const impScore = maxImp >= 4 ? 15 : maxImp >= 3 ? 10 : 5;
  const avgConf = events.reduce((s, e) => s + (e.confidenceScore ?? 50), 0) / events.length;
  const confScore = Math.round(avgConf / 10);
  return Math.min(100, eventScore + sourceScore + crossCatScore + hotScore + impScore + confScore);
}

function getMaxImportance(events: TriggerEvent[]): EventImportance {
  const sorted = [...events].sort(
    (a, b) =>
      (IMPACT_ORDER[b.avangardImpact?.level ?? b.importance ?? 'low'] ?? 1) -
      (IMPACT_ORDER[a.avangardImpact?.level ?? a.importance ?? 'low'] ?? 1)
  );
  return (sorted[0]?.avangardImpact?.level ?? sorted[0]?.importance ?? 'low') as EventImportance;
}

function isHotCluster(events: TriggerEvent[]): boolean {
  const FOURTEEN_DAYS = 14 * 86_400_000;
  return events.some(e => Date.now() - new Date(e.date).getTime() < FOURTEEN_DAYS);
}

function makeClusterId(events: TriggerEvent[]): string {
  return [...events].map(e => e.id).sort().join('|');
}

// ── Labels ─────────────────────────────────────────────────────────────────────

const DIR_LABEL: Partial<Record<AvangardDirection, string>> = {
  workwear: 'Спецодежда', footwear: 'Спецобувь', ppe: 'СИЗ',
  'hi-vis': 'Сигнальная', 'flame-resistant': 'Огнестойкость',
  antistatic: 'Антистатика', membranes: 'Мембраны',
  'oil-gas': 'Нефтегаз', metallurgy: 'Металлургия',
  construction: 'Строительство', chemicals: 'Химия', energy: 'Энергетика',
};

const CAT_LABEL: Record<string, string> = {
  competitor: 'конкурент', tender: 'тендер', regulation: 'регуляторика',
  news: 'новости', other: 'прочее',
};

// ── Cluster builders ───────────────────────────────────────────────────────────

function buildSameCompetitorClusters(events: TriggerEvent[]): SignalCluster[] {
  const groups = new Map<string, TriggerEvent[]>();
  for (const e of events) {
    if (!e.competitorName) continue;
    if (!groups.has(e.competitorName)) groups.set(e.competitorName, []);
    groups.get(e.competitorName)!.push(e);
  }
  const clusters: SignalCluster[] = [];
  for (const [name, evs] of groups) {
    if (evs.length < 2) continue;
    const dirs = [...new Set(evs.flatMap(e => getEventDirections(e)))];
    const dirsLabel = dirs.slice(0, 3).map(d => DIR_LABEL[d] ?? d).join(', ');
    clusters.push({
      id: `comp:${name}:` + makeClusterId(evs),
      label: `${name}: комплексная угроза`,
      correlationType: 'same_competitor',
      events: evs,
      strength: calcStrength(evs),
      maxImportance: getMaxImportance(evs),
      sharedDimension: name,
      insight: `${name} активен в ${evs.length} независимых сигналах${dirsLabel ? ': ' + dirsLabel : ''}.`,
      isHot: isHotCluster(evs),
      uniqueCategories: [...new Set(evs.map(e => e.category))],
    });
  }
  return clusters;
}

function buildSameTechnologyClusters(events: TriggerEvent[]): SignalCluster[] {
  const groups = new Map<AvangardDirection, TriggerEvent[]>();
  for (const e of events) {
    for (const dir of getEventDirections(e)) {
      if (!groups.has(dir)) groups.set(dir, []);
      const bucket = groups.get(dir)!;
      if (!bucket.find(x => x.id === e.id)) bucket.push(e);
    }
  }
  const clusters: SignalCluster[] = [];
  for (const [dir, evs] of groups) {
    if (evs.length < 2) continue;
    const cats = [...new Set(evs.map(e => e.category))];
    const dirName = DIR_LABEL[dir] ?? dir;
    const catsLabel = cats.map(c => CAT_LABEL[c] ?? c).join(' + ');
    const strength = calcStrength(evs);
    if (strength < 20) continue;
    clusters.push({
      id: `tech:${dir}:` + makeClusterId(evs),
      label: `${dirName}: ${evs.length} сигналов`,
      correlationType: 'same_technology',
      events: evs,
      strength,
      maxImportance: getMaxImportance(evs),
      sharedDimension: dirName,
      insight: `${dirName} под давлением из ${evs.length} независимых источников (${catsLabel}).`,
      isHot: isHotCluster(evs),
      uniqueCategories: cats,
    });
  }
  return clusters;
}

function buildRegulatoryAmplifiesClusters(events: TriggerEvent[]): SignalCluster[] {
  const THIRTY_DAYS = 30 * 86_400_000;
  const regEvents = events.filter(e => e.category === 'regulation');
  const targetEvents = events.filter(e => e.category === 'competitor' || e.category === 'tender');
  const clusters: SignalCluster[] = [];

  for (const reg of regEvents) {
    const regDirs = new Set(getEventDirections(reg));
    const paired = targetEvents.filter(e => {
      const sharesDir = getEventDirections(e).some(d => regDirs.has(d));
      const timeDiff = Math.abs(new Date(reg.date).getTime() - new Date(e.date).getTime());
      return sharesDir || timeDiff <= THIRTY_DAYS;
    });
    if (paired.length === 0) continue;
    const evs = [reg, ...paired];
    const cats = [...new Set(evs.map(e => e.category))];
    const sharedDirs = [...regDirs].filter(d => paired.some(e => getEventDirections(e).includes(d)));
    const dirName = sharedDirs.length > 0 ? (DIR_LABEL[sharedDirs[0]] ?? sharedDirs[0]) : 'этом направлении';
    const targetTypes = [...new Set(paired.map(e => CAT_LABEL[e.category] ?? e.category))].join(' и ');
    clusters.push({
      id: `reg:${reg.id}:` + makeClusterId(paired),
      label: `Регуляторика усиливает ${targetTypes}`,
      correlationType: 'regulatory_amplifies',
      events: evs,
      strength: calcStrength(evs),
      maxImportance: getMaxImportance(evs),
      sharedDimension: dirName,
      insight: `Регуляторный сигнал усиливает ${targetTypes} в направлении: ${dirName}.`,
      isHot: isHotCluster(evs),
      uniqueCategories: cats,
    });
  }
  return clusters;
}

export function buildCorrelationClusters(events: TriggerEvent[]): SignalCluster[] {
  return [
    ...buildSameCompetitorClusters(events),
    ...buildSameTechnologyClusters(events),
    ...buildRegulatoryAmplifiesClusters(events),
  ].sort((a, b) => b.strength - a.strength);
}

// ── UI constants ──────────────────────────────────────────────────────────────

const STRENGTH_STEPS = [
  { min: 70, label: '⚡', cls: 'bg-red-100 text-red-700 border border-red-200' },
  { min: 45, label: '▲',  cls: 'bg-orange-100 text-orange-700 border border-orange-100' },
  { min: 20, label: '◆',  cls: 'bg-yellow-50 text-yellow-700 border border-yellow-100' },
  { min: 0,  label: '·',  cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
];
const getStrengthBadge = (s: number) => STRENGTH_STEPS.find(b => s >= b.min) ?? STRENGTH_STEPS[STRENGTH_STEPS.length - 1];

const TYPE_LABEL: Record<CorrelationType, string> = {
  same_competitor:      'Конкурент',
  same_technology:      'Технология',
  regulatory_amplifies: 'Регуляторика',
};
const TYPE_CLS: Record<CorrelationType, string> = {
  same_competitor:      'bg-orange-50 text-orange-700 border border-orange-100',
  same_technology:      'bg-blue-50 text-blue-700 border border-blue-100',
  regulatory_amplifies: 'bg-purple-50 text-purple-700 border border-purple-100',
};
const IMPACT_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-50 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
};
const CAT_TAG_CLS: Record<string, string> = {
  competitor:  'bg-orange-50 text-orange-600 border border-orange-100',
  tender:      'bg-emerald-50 text-emerald-600 border border-emerald-100',
  regulation:  'bg-purple-50 text-purple-600 border border-purple-100',
  news:        'bg-blue-50 text-blue-600 border border-blue-100',
  other:       'bg-gray-50 text-gray-500 border border-gray-200',
};
const DOT_CLS: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
};

// ── ClusterCard ───────────────────────────────────────────────────────────────

function ClusterCard({ cluster }: { cluster: SignalCluster }) {
  const badge = getStrengthBadge(cluster.strength);
  const sortedEvents = [...cluster.events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className={`bg-white border rounded-xl p-4 flex flex-col gap-3 ${cluster.isHot ? 'border-orange-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_CLS[cluster.correlationType]}`}>
              {TYPE_LABEL[cluster.correlationType]}
            </span>
            {cluster.isHot && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">
                🔥 горячий
              </span>
            )}
            {cluster.uniqueCategories.map(c => (
              <span key={c} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CAT_TAG_CLS[c] ?? ''}`}>
                {CAT_LABEL[c] ?? c}
              </span>
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{cluster.label}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label} {cluster.strength}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${IMPACT_BADGE[cluster.maxImportance] ?? ''}`}>
            {cluster.maxImportance}
          </span>
        </div>
      </div>

      {/* Insight */}
      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        <p className="text-[11px] text-amber-800 leading-snug">{cluster.insight}</p>
      </div>

      {/* Events */}
      <div className="space-y-1.5 border-t border-gray-50 pt-2.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Связанные сигналы ({cluster.events.length})
        </p>
        {sortedEvents.map(e => {
          const date = new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
          const imp = e.avangardImpact?.level ?? e.importance ?? 'low';
          return (
            <div key={e.id} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${DOT_CLS[imp] ?? 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-700 leading-snug line-clamp-1">{e.title}</p>
                <p className="text-[10px] text-gray-400">{date} · {extractDomain(e.url)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CorrelationEngineProps {
  events: TriggerEvent[];
}

export default function CorrelationEngine({ events }: CorrelationEngineProps) {
  if (events.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Недостаточно данных для корреляций</p>
        <p className="text-xs text-gray-400">
          Проанализируйте несколько URL — корреляции строятся автоматически при наличии 2+ связанных сигналов
        </p>
      </div>
    );
  }

  const clusters = buildCorrelationClusters(events);

  if (clusters.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-sm font-medium text-gray-700 mb-1">Корреляций не обнаружено</p>
        <p className="text-xs text-gray-400">
          Добавьте больше сигналов из разных источников — система выявит связанные паттерны
        </p>
      </div>
    );
  }

  const hotClusters = clusters.filter(c => c.isHot);

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Кластеров',      val: clusters.length,                                                           cls: 'text-gray-700' },
          { label: 'Горячих',        val: hotClusters.length,                                                        cls: hotClusters.length > 0 ? 'text-red-600' : 'text-gray-400' },
          { label: 'По конкурентам', val: clusters.filter(c => c.correlationType === 'same_competitor').length,      cls: 'text-orange-600' },
          { label: 'Регуляторных',   val: clusters.filter(c => c.correlationType === 'regulatory_amplifies').length, cls: 'text-purple-600' },
        ].map(({ label, val, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-[110px] text-center">
            <p className={`text-xl font-bold ${cls}`}>{val}</p>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Hot Signals */}
      {hotClusters.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">🔥 Горячие сигналы</p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-500">{hotClusters.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hotClusters.map(c => <ClusterCard key={c.id} cluster={c} />)}
          </div>
        </div>
      )}

      {/* All Clusters */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Все корреляции</p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{clusters.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clusters.map(c => <ClusterCard key={c.id} cluster={c} />)}
        </div>
      </div>
    </div>
  );
}
