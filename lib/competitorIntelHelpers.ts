import type { TriggerEvent, AvangardDirection, EventImportance } from './types';

// Minimal cluster shape needed for scoring — avoids importing 'use client' CorrelationEngine
type ClusterRef = { events: Array<{ id: string }> };

// ── Constants ─────────────────────────────────────────────────────────────────

export const CORE_DIRS: ReadonlySet<AvangardDirection> = new Set<AvangardDirection>([
  'workwear', 'ppe', 'flame-resistant', 'oil-gas', 'metallurgy', 'membranes',
]);

export const DIR_LABEL: Record<AvangardDirection, string> = {
  workwear:          'Спецодежда',
  footwear:          'Спецобувь',
  ppe:               'СИЗ',
  'hi-vis':          'Сигнальная',
  'flame-resistant': 'Огнестойкость',
  antistatic:        'Антистатика',
  membranes:         'Мембраны',
  'oil-gas':         'Нефтегаз',
  metallurgy:        'Металлургия',
  construction:      'Строительство',
  chemicals:         'Химия',
  energy:            'Энергетика',
};

const IMPACT_ORDER: Record<EventImportance, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const SEVERITY_PTS: Record<EventImportance, number> = {
  critical: 40, high: 26, medium: 14, low: 6,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThreatScoreLevel = 'critical' | 'high' | 'moderate' | 'low';

export interface EnhancedCompetitorProfile {
  name:                 string;
  activeEvents:         TriggerEvent[];
  archivedEvents:       TriggerEvent[];
  recentEvents:         TriggerEvent[];   // within last 30 days
  threatScore:          number;           // 0–100
  threatScoreLevel:     ThreatScoreLevel;
  newSignals30d:        number;
  latestEventDate:      string;
  maxThreatLevel:       EventImportance;
  criticalHighCount:    number;
  overlapDirs:          AvangardDirection[];
  coreOverlapDirs:      AvangardDirection[];
  relevantClusterCount: number;
  whyNow:               string;           // deterministic, no Gemini
  situationText:        string;
  allThreats:           Array<{ text: string; level: EventImportance }>;
  allOpportunities:     Array<{ text: string; level: EventImportance }>;
  allActions:           Array<{ text: string; level: EventImportance }>;
}

export interface CompetitiveIntelSummary {
  competitorCount:   number;
  mostDangerousName: string | null;
  newSignalsLast30d: number;
  sharedAttackDirs:  AvangardDirection[];
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

export function resolveCompetitorName(event: TriggerEvent): string {
  if (event.competitorName && event.competitorName !== 'null') return event.competitorName;
  try {
    const host = new URL(event.url).hostname.replace('www.', '');
    const MAP: Record<string, string> = {
      'technoavia.ru':       'Техноавиа',
      'vostok-service.ru':   'Восток-Сервис',
      'ursus.ru':            'Урсус',
      'soyuzspecodezhda.ru': 'СОЮЗСПЕЦОДЕЖДА',
      'trakt.ru':            'Тракт',
    };
    return MAP[host] ?? host;
  } catch {
    return 'Неизвестный конкурент';
  }
}

export function resolveThreatLevel(event: TriggerEvent): EventImportance {
  if (event.competitorIntel?.threatLevel) return event.competitorIntel.threatLevel;
  if (event.avangardImpact?.level)        return event.avangardImpact.level;
  return event.importance ?? 'low';
}

function maxImportance(levels: EventImportance[]): EventImportance {
  return levels.reduce<EventImportance>(
    (best, cur) => IMPACT_ORDER[cur] > IMPACT_ORDER[best] ? cur : best,
    'low',
  );
}

function isWithin30Days(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 30 * 86_400_000;
}

function formatDaysAgo(dateStr: string): string {
  const days = Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
  if (days === 1) return '1 день назад';
  if (days < 5)  return `${days} дня назад`;
  return `${days} дней назад`;
}

// ── Threat Score (deterministic) ──────────────────────────────────────────────

export function computeThreatScore(
  activeEvents:   TriggerEvent[],
  archivedEvents: TriggerEvent[],
  clusters:       ClusterRef[],
): number {
  const all = [...activeEvents, ...archivedEvents];
  if (all.length === 0) return 0;

  const now = Date.now();
  const D7  =  7 * 86_400_000;
  const D30 = 30 * 86_400_000;
  const D90 = 90 * 86_400_000;

  // 1. Event score (cap 65)
  let rawEvent = 0;
  for (const e of all) {
    const pts  = SEVERITY_PTS[resolveThreatLevel(e)] ?? 6;
    const age  = now - new Date(e.date).getTime();
    const rec  = age < D7 ? 1.6 : age < D30 ? 1.3 : age < D90 ? 1.0 : 0.5;
    const stat = e.status === 'archived' ? 0.6 : 1.0;
    rawEvent += pts * rec * stat;
  }
  const eventScore = Math.min(65, rawEvent);

  // 2. Correlation score (cap 20)
  const ids         = new Set(all.map(e => e.id));
  const relClusters = clusters.filter(c => c.events.some(e => ids.has(e.id)));
  const corrScore   = Math.min(20, relClusters.length * 8);

  // 3. Core direction overlap score (cap 15)
  const allOverlap   = new Set<AvangardDirection>(all.flatMap(e => e.competitorIntel?.overlap ?? []));
  const coreCount    = [...allOverlap].filter(d => CORE_DIRS.has(d)).length;
  const overlapScore = Math.min(15, coreCount * 3);

  return Math.min(100, Math.round(eventScore + corrScore + overlapScore));
}

export function threatScoreToLevel(score: number): ThreatScoreLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

// ── Why Now (deterministic, no Gemini) ───────────────────────────────────────

function buildWhyNow(
  recentEvents:    TriggerEvent[],
  coreOverlapDirs: AvangardDirection[],
): string {
  const parts: string[] = [];

  if (recentEvents.length === 0) {
    parts.push('Новых сигналов за последние 30 дней не зафиксировано.');
  } else {
    const sorted = [...recentEvents].sort(
      (a, b) => IMPACT_ORDER[resolveThreatLevel(b)] - IMPACT_ORDER[resolveThreatLevel(a)],
    );
    const top    = sorted[0];
    const reason = top.avangardImpact?.reason;
    if (reason) {
      const truncated = reason.length > 165 ? reason.slice(0, 165) + '…' : reason;
      parts.push(`${formatDaysAgo(top.date)}: ${truncated}`);
    } else {
      const title = top.title.length > 90 ? top.title.slice(0, 90) + '…' : top.title;
      parts.push(`${formatDaysAgo(top.date)}: ${title}.`);
    }
    if (recentEvents.length > 1) {
      parts.push(`Всего ${recentEvents.length} сигнала за 30 дней.`);
    }
  }

  if (coreOverlapDirs.length > 0) {
    const names = coreOverlapDirs.slice(0, 4).map(d => DIR_LABEL[d]).join(' · ');
    parts.push(`Направления под угрозой: ${names}.`);
  }

  return parts.join('\n');
}

// ── Build profiles ────────────────────────────────────────────────────────────

export function buildEnhancedProfiles(
  activeEvents: TriggerEvent[],
  allEvents:    TriggerEvent[],
  clusters:     ClusterRef[],
): EnhancedCompetitorProfile[] {
  const map = new Map<string, { active: TriggerEvent[]; archived: TriggerEvent[] }>();

  for (const e of allEvents) {
    if (e.category !== 'competitor') continue;
    const name = resolveCompetitorName(e);
    if (!map.has(name)) map.set(name, { active: [], archived: [] });
    const bucket = e.status === 'archived' ? 'archived' : 'active';
    map.get(name)![bucket].push(e);
  }

  const profiles: EnhancedCompetitorProfile[] = [];

  for (const [name, { active, archived }] of map.entries()) {
    const all = [...active, ...archived].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const recent          = all.filter(e => isWithin30Days(e.date));
    const overlapSet      = new Set<AvangardDirection>(all.flatMap(e => e.competitorIntel?.overlap ?? []));
    const overlapDirs     = [...overlapSet];
    const coreOverlapDirs = overlapDirs.filter(d => CORE_DIRS.has(d));

    const maxThreatLevel    = maxImportance(all.map(resolveThreatLevel));
    const criticalHighCount = all.filter(e => {
      const l = resolveThreatLevel(e);
      return l === 'critical' || l === 'high';
    }).length;

    const threatScore      = computeThreatScore(active, archived, clusters);
    const threatScoreLevel = threatScoreToLevel(threatScore);

    const ids         = new Set(all.map(e => e.id));
    const relClusters = clusters.filter(c => c.events.some(e => ids.has(e.id)));

    const topEvent      = all.find(e => resolveThreatLevel(e) === maxThreatLevel) ?? all[0];
    const situationText = topEvent?.whyItMattersForAvangard ?? topEvent?.avangardImpact?.reason ?? '';

    const byLevel = (a: { level: EventImportance }, b: { level: EventImportance }) =>
      IMPACT_ORDER[b.level] - IMPACT_ORDER[a.level];

    const allThreats = all
      .flatMap(e => (e.threats ?? []).map(text => ({ text, level: resolveThreatLevel(e) })))
      .sort(byLevel).slice(0, 6);

    const allOpportunities = all
      .flatMap(e => (e.opportunities ?? []).map(text => ({ text, level: resolveThreatLevel(e) })))
      .sort(byLevel).slice(0, 6);

    const allActions = all
      .filter(e => e.suggestedAction)
      .map(e => ({ text: e.suggestedAction!, level: resolveThreatLevel(e) }))
      .sort(byLevel).slice(0, 5);

    profiles.push({
      name,
      activeEvents:         active,
      archivedEvents:       archived,
      recentEvents:         recent,
      threatScore,
      threatScoreLevel,
      newSignals30d:        recent.length,
      latestEventDate:      all[0]?.date ?? new Date(0).toISOString(),
      maxThreatLevel,
      criticalHighCount,
      overlapDirs,
      coreOverlapDirs,
      relevantClusterCount: relClusters.length,
      whyNow:               buildWhyNow(recent, coreOverlapDirs),
      situationText,
      allThreats,
      allOpportunities,
      allActions,
    });
  }

  return profiles.sort((a, b) => b.threatScore - a.threatScore);
}

// ── Hub summary ───────────────────────────────────────────────────────────────

export function buildHubSummary(
  profiles: EnhancedCompetitorProfile[],
): CompetitiveIntelSummary {
  const totalNew = profiles.reduce((s, p) => s + p.newSignals30d, 0);

  const dirCount = new Map<AvangardDirection, number>();
  for (const p of profiles) {
    for (const d of p.coreOverlapDirs) {
      dirCount.set(d, (dirCount.get(d) ?? 0) + 1);
    }
  }
  const sharedAttackDirs = [...dirCount.entries()]
    .filter(([, n]) => n >= 2)
    .map(([d]) => d);

  return {
    competitorCount:   profiles.length,
    mostDangerousName: profiles[0]?.name ?? null,
    newSignalsLast30d: totalNew,
    sharedAttackDirs,
  };
}
