import type { TriggerEvent } from './types';

export type ReportSeverity = 'normal' | 'attention' | 'critical';

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

export interface StructuredReport {
  headline: string;
  avangardImpactSection: ReportSection;
  sections: ReportSection[];
  priorityActions: ReportAction[];
  trustBlock: ReportTrustBlock;
  reportSeverity: ReportSeverity;
  generatedAt: string;
}

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
