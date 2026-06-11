import type { TriggerEvent } from './types';

export type ReportSeverity = 'normal' | 'attention' | 'critical';

// ── Tezis & Section — used in content sections ────────────────────────────────

export interface ReportTezis {
  text: string;
  sourceEventIds?: string[];
  sourceCorrelationIds?: string[];
  confidenceScore?: number;
  evidenceQuotes?: string[];
}

export interface ReportSection {
  title: string;
  tezises: ReportTezis[];
  avgConfidence?: number;
}

// ── Executive Insight (Phase 8.5+) ───────────────────────────────────────────

export interface InsightBlock {
  text: string;
  sourceEventIds: string[];
  sourceCorrelationIds?: string[];
  confidenceScore?: number;
  confidenceReason?: string;
  evidenceQuotes?: string[];
}

export interface ExecutiveInsight {
  mainConclusion: InsightBlock;
  mainThreat?: InsightBlock;        // absent when no competitor/threat events
  mainOpportunity?: InsightBlock;   // absent when no tender/opportunity events
  urgentAction: InsightBlock;
}

// ── Actions & Trust ───────────────────────────────────────────────────────────

export interface ReportAction {
  action: string;
  responsible?: string;
  deadline?: string;
  sourceEventIds?: string[];
  sourceCorrelationIds?: string[];
}

export interface ReportTrustBlock {
  signalCount: number;
  sourceCount: number;
  competitorCount: number;
  avgConfidenceScore: number;
  correlationCount: number;
  period: string;
}

// ── Structured Report ─────────────────────────────────────────────────────────

export interface StructuredReport {
  headline: string;
  /** Phase 8.5+: 4-block management insight. Rendered instead of avangardImpactSection when present. */
  executiveInsight?: ExecutiveInsight;
  /** @deprecated kept for backward compat with pre-8.5 stored reports */
  avangardImpactSection: ReportSection;
  sections: ReportSection[];
  priorityActions: ReportAction[];
  trustBlock: ReportTrustBlock;
  reportSeverity: ReportSeverity;
  generatedAt: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export interface CorrelationSnapshot {
  id: string;
  label: string;
  correlationType: string;
  strength: number;
  insight: string;
  eventIds: string[];
}

export interface StoredReport {
  id: string;
  title: string;
  report: StructuredReport;
  eventSnapshots: TriggerEvent[];
  correlationSnapshots: CorrelationSnapshot[];
  generatedAt: string;
  eventCount: number;
}
