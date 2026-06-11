import type { TriggerEvent } from './types';
import type { ReportTrustBlock, ReportSeverity, CorrelationSnapshot } from './reportTypes';

// ── Domain helpers ────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

// ── Trust Block ───────────────────────────────────────────────────────────────

export function buildTrustBlock(
  events: TriggerEvent[],
  clusters: CorrelationSnapshot[],
): ReportTrustBlock {
  const uniqueSources = new Set(events.map(e => extractDomain(e.url)));
  const uniqueCompetitors = new Set(
    events.filter(e => e.competitorName).map(e => e.competitorName!)
  );
  const withConf = events.filter(e => typeof e.confidenceScore === 'number');
  const avgConf =
    withConf.length > 0
      ? Math.round(withConf.reduce((s, e) => s + e.confidenceScore!, 0) / withConf.length)
      : 0;

  const timestamps = events.map(e => new Date(e.date).getTime()).sort((a, b) => a - b);
  const fmt = (ts: number, withYear: boolean) =>
    new Date(ts).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });

  const period =
    timestamps.length > 1
      ? `${fmt(timestamps[0], false)} — ${fmt(timestamps[timestamps.length - 1], true)}`
      : fmt(timestamps[0] ?? Date.now(), true);

  return {
    signalCount: events.length,
    sourceCount: uniqueSources.size,
    competitorCount: uniqueCompetitors.size,
    avgConfidenceScore: avgConf,
    correlationCount: clusters.length,
    period,
  };
}

// ── Severity ──────────────────────────────────────────────────────────────────

export function computeSeverity(
  events: TriggerEvent[],
  clusters: CorrelationSnapshot[],
): ReportSeverity {
  const hasCriticalTender = events.some(
    e =>
      e.category === 'tender' &&
      (e.avangardImpact?.level === 'critical' || e.importance === 'critical'),
  );
  const hasHighStrengthCluster = clusters.some(c => c.strength >= 90);

  if (hasCriticalTender || hasHighStrengthCluster) return 'critical';

  const hasCriticalEvent = events.some(
    e => e.avangardImpact?.level === 'critical' || e.importance === 'critical',
  );
  const highCount = events.filter(
    e => e.avangardImpact?.level === 'high' || e.importance === 'high',
  ).length;

  if (hasCriticalEvent || highCount >= 2) return 'attention';

  return 'normal';
}

// ── Insight Anchors ───────────────────────────────────────────────────────────

export interface InsightAnchors {
  topThreat: TriggerEvent | null;
  topOpportunity: TriggerEvent | null;
  mostUrgent: TriggerEvent | null;
  topCluster: CorrelationSnapshot | null;
}

function severityRank(e: TriggerEvent): number {
  const level = e.avangardImpact?.level ?? e.importance ?? 'low';
  return ({ critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>)[level] ?? 0;
}

function nearestExpiry(e: TriggerEvent): number {
  return e.expiresAt ? new Date(e.expiresAt).getTime() : Infinity;
}

export function buildInsightAnchors(
  events: TriggerEvent[],
  clusters: CorrelationSnapshot[],
): InsightAnchors {
  // Top threat: competitor events first, then by severity desc
  const topThreat =
    events
      .filter(e => e.category === 'competitor' || e.competitorIntel?.threatLevel === 'critical')
      .sort((a, b) => severityRank(b) - severityRank(a))[0] ??
    events
      .filter(e => severityRank(e) >= 3)
      .sort((a, b) => severityRank(b) - severityRank(a))[0] ??
    null;

  // Top opportunity: tender with nearest deadline first, then events with opportunities[]
  const topOpportunity =
    events
      .filter(e => e.category === 'tender')
      .sort((a, b) => nearestExpiry(a) - nearestExpiry(b))[0] ??
    events
      .filter(e => (e.opportunities?.length ?? 0) > 0 && e.category !== 'competitor')
      .sort((a, b) => severityRank(b) - severityRank(a))[0] ??
    null;

  // Most urgent: critical/high with nearest expiresAt, fallback to topThreat/topOpportunity
  const mostUrgent =
    events
      .filter(e => severityRank(e) >= 3 && !!e.expiresAt)
      .sort((a, b) => nearestExpiry(a) - nearestExpiry(b))[0] ??
    topThreat ??
    topOpportunity ??
    events[0] ??
    null;

  // Top cluster by strength
  const topCluster =
    clusters.length > 0
      ? [...clusters].sort((a, b) => b.strength - a.strength)[0]
      : null;

  return { topThreat, topOpportunity, mostUrgent, topCluster };
}

// ── Confidence Reason ─────────────────────────────────────────────────────────

export function computeConfidenceReason(
  sourceEventIds: string[],
  sourceCorrelationIds: string[] | undefined,
  eventMap: Map<string, TriggerEvent>,
  clusters: CorrelationSnapshot[],
): string {
  const count = sourceEventIds.length;
  const hasCorr = (sourceCorrelationIds?.length ?? 0) > 0;
  const topCorr = hasCorr
    ? clusters.find(c => sourceCorrelationIds!.includes(c.id))
    : undefined;

  const scores = sourceEventIds
    .map(id => eventMap.get(id)?.confidenceScore)
    .filter((s): s is number => s !== undefined);
  const avgConf = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  if (count === 1 && !hasCorr) {
    if (avgConf >= 80) return 'Высокая достоверность — подтверждено источником высокого качества';
    if (avgConf >= 65) return 'Умеренная достоверность — основано на одном источнике';
    return 'Требует дополнительной проверки';
  }
  if (topCorr && topCorr.strength >= 70) {
    return 'Подтверждено сильным корреляционным кластером';
  }
  if (hasCorr) {
    return 'Основано на конкурентном сигнале и корреляционном паттерне';
  }
  if (count >= 3 && avgConf >= 85) {
    return `Подтверждено ${count} независимыми источниками`;
  }
  if (count >= 2) {
    return `Основано на ${count} источниках`;
  }
  return 'Требует дополнительной проверки';
}
