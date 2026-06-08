export type EventCategory = 'news' | 'tender' | 'competitor' | 'regulation' | 'other';
export type EventImportance = 'critical' | 'high' | 'medium' | 'low';

export interface AvangardImpact {
  level: EventImportance;
  reason: string; // one sentence: why this specifically affects Avangard
}

export interface EvidenceBlock {
  quotes: string[];        // verbatim extracts from source text
  interpretation: string;  // what the AI inferred beyond those facts
}

export interface AnalyticsEvidence {
  whyItMattersForAvangard?: EvidenceBlock;
  opportunities?: EvidenceBlock[];  // parallel to opportunities[]
  threats?: EvidenceBlock[];        // parallel to threats[]
  suggestedAction?: EvidenceBlock;
}

export interface TriggerEvent {
  id: string;
  url: string;
  title: string;
  category: EventCategory;
  summary: string;
  signals: string[];
  date: string;
  markedForBrief: boolean;

  importance?: EventImportance;
  avangardImpact?: AvangardImpact;
  sourceType?: string;
  whatHappened?: string;
  /** @deprecated use whyItMattersForAvangard */
  whyItMattersForWorkwear?: string;
  whyItMattersForAvangard?: string;
  consequences?: string[];
  opportunities?: string[];
  threats?: string[];
  suggestedAction?: string;
  competitorName?: string | null;
  evidence?: AnalyticsEvidence;
}
