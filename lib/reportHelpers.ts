import type { TriggerEvent } from './types';
import type { ReportTrustBlock, ReportSeverity, CorrelationSnapshot } from './reportTypes';

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 30); }
}

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
