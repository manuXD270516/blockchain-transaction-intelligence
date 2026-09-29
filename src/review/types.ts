import type { Investigation } from '../adapters/contracts.js';
import type { Transfer } from '../events/extract.js';
import type { AnalysisDraft, Claim, ClaimClassification, ModelUsage, ProviderManifest,
  RejectedClaim, ReviewRole } from '../agents/types.js';

export const REVIEW_POLICY_VERSION = 'evidence-review-policy/1.0.0' as const;
export const VALIDATOR_VERSION = 'evidence-review-validators/1.0.0' as const;
export const ANOMALY_RULES_VERSION = 'anomaly-rules/1.0.0' as const;

export type ReviewStatus = 'proposed' | 'supported' | 'rejected' | 'needs_revision';
export type ReportStatus = 'accepted' | 'partial' | 'inconclusive';

export const FINDING_CODES = ['REFERENCES_RESOLVED', 'MISSING_PARENT', 'CLASS_MISMATCH', 'CONTRADICTION',
  'SNAPSHOT_CONFLICT', 'INSUFFICIENT_EVIDENCE'] as const;
export type FindingCode = typeof FINDING_CODES[number];

export const REVIEW_REASONS = ['ENTAILED', 'NOT_ENTAILED', 'OVERREACH', 'MISSING_ALTERNATIVES', 'INCOMPATIBLE_DOCUMENT',
  'EVENT_OVERREACH', 'PROHIBITED_ATTRIBUTION', 'INSUFFICIENT_EVIDENCE'] as const;
export type ReviewReason = typeof REVIEW_REASONS[number];

export type EvidenceKind = 'rpc_raw' | 'fixture_materialized' | 'derived' | 'tool_envelope' | 'document_span';

export interface IndexedEvidence {
  evidence_id: string;
  kind: EvidenceKind;
  source: string;
  parent_evidence_ids: string[];
  transformation: string | null;
  compatibility: 'matched' | 'generic' | 'unknown' | 'conflicting' | null;
  corpus_snapshot_id: string | null;
  excerpt: string | null;
  dag_verified: boolean;
}

export interface EvidenceRequest { claim_id: string; evidence_id: string; reason: string }

export interface EvidenceFinding { claim_id: string; code: FindingCode }

export interface ReviewVerdict {
  claim_id: string;
  verdict: 'supported' | 'rejected' | 'needs_revision';
  reasons: ReviewReason[];
}

export interface EvidenceAgentResponse {
  schema_version: '1.0.0';
  role: 'evidence_agent';
  phase: 'review' | 'correction';
  findings: EvidenceFinding[];
  evidence_requests: EvidenceRequest[];
  tool_requests: unknown[];
  warnings: string[];
  usage: ModelUsage;
}

export interface ReviewerResponse {
  schema_version: '1.0.0';
  role: 'reviewer';
  phase: 'review' | 'correction';
  verdicts: ReviewVerdict[];
  evidence_requests: EvidenceRequest[];
  tool_requests: unknown[];
  warnings: string[];
  usage: ModelUsage;
}

export interface ReviewedClaim extends Omit<Claim, 'review_status'> {
  review_status: ReviewStatus;
  review_reasons: string[];
}

export interface Anomaly {
  anomaly_id: string;
  claim_id: string;
  classification: ClaimClassification;
  label: string;
  rule: { id: string; version: string; threshold: number; window: string } | null;
  limitations: string[];
}

export interface ReviewBudgets {
  max_model_calls: 4;
  max_model_calls_per_role: 2;
  model_calls: number;
  input_tokens: number;
  output_tokens: number;
  corrections: number;
}

export interface ReviewedReport {
  schema_version: '1.0.0';
  report_id: string;
  status: ReportStatus;
  mode: Investigation['mode'];
  question: string;
  summary: { supported: number; validated_facts: number; rejected: number; needs_revision: number;
    unreviewed: number; anomalies: number; statement: string };
  timeline: { sequence: string; kind: 'block' | 'transaction' | 'receipt' | 'log'; ref: string; evidence_ids: string[] }[];
  entities: { id: string; address: string; observed_roles: string[]; identity: 'unknown' }[];
  events: { id: string; emitter: string; status: string; standard_candidate: string | null; event_name: string | null;
    evidence_ids: string[] }[];
  transfers: Transfer[];
  conclusions: ReviewedClaim[];
  validated_facts: ReviewedClaim[];
  audit: { claims: ReviewedClaim[]; analysis_rejections: RejectedClaim[] };
  claim_evidence: { claim_id: string; classification: ClaimClassification; review_status: ReviewStatus;
    evidence: { evidence_id: string; kind: EvidenceKind | 'unresolved'; source: string }[] }[];
  documents: { chunk_id: string; corpus_snapshot_id: string | null; compatibility: string | null; excerpt: string | null }[];
  anomalies: Anomaly[];
  limitations: string[];
  coverage: AnalysisDraft['coverage'] & { evidence_agent: 'completed' | 'not_run' | 'failed';
    reviewer: 'completed' | 'not_run' | 'failed'; review_missing: string[] };
  budgets: { analysis: AnalysisDraft['manifest']['budgets']; review: ReviewBudgets; deadline_ms: 90000 };
  review_journal: { role: ReviewRole; code: string }[];
  replay_manifest: {
    draft_id: string;
    analysis_input_hash: string;
    bundle_id: string;
    extraction_id: string;
    snapshot: AnalysisDraft['manifest']['snapshot'];
    corpus_snapshot_ids: string[];
    provider: ProviderManifest | null;
    review_policy_version: typeof REVIEW_POLICY_VERSION;
    validator_version: typeof VALIDATOR_VERSION;
    anomaly_rules_version: typeof ANOMALY_RULES_VERSION;
    duration_ms: number;
  };
  warnings: string[];
}