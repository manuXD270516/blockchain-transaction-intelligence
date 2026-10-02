import type { Json } from '../domain/types.js';

export type AnalystRole = 'transaction_analyst' | 'contract_analyst';
export type ClaimClassification = 'OBSERVED' | 'RULE-BASED' | 'MODEL-INFERRED';
export type ClaimUncertainty = 'supported' | 'limited' | 'unknown';

export interface Claim {
  schema_version: '1.0.0';
  claim_id: string;
  text: string;
  subject_refs: string[];
  classification: ClaimClassification;
  evidence_ids: string[];
  derivation: { rule: string; version: string } | null;
  uncertainty: ClaimUncertainty;
  limitations: string[];
  alternatives: string[];
  author: { role: 'baseline' | AnalystRole; provider: string | null; model: string | null; prompt_version: string };
  review_status: 'proposed';
}

export interface ModelClaim {
  text: string;
  subject_refs: string[];
  classification: 'MODEL-INFERRED';
  evidence_ids: string[];
  uncertainty: ClaimUncertainty;
  limitations: string[];
  alternatives: string[];
}

export interface ToolRequest {
  request_id: string;
  tool: string;
  arguments: Record<string, Json>;
  justification: string;
}

export interface ToolResultRecord {
  request_id: string;
  tool: string;
  status: 'ok' | 'denied' | 'error';
  structured_content: Record<string, unknown> | null;
  error_code: string | null;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number | null;
}

export interface ModelResponse {
  schema_version: '1.0.0';
  role: AnalystRole;
  phase: 'tools' | 'claims' | 'correction';
  tool_requests: ToolRequest[];
  claims: ModelClaim[];
  warnings: string[];
  usage: ModelUsage;
}

export type ReviewRole = 'evidence_agent' | 'reviewer';

export interface ProviderManifest {
  provider: string;
  model: string;
  version: string;
  prompt_versions: Record<AnalystRole, string>;
  review_prompt_versions?: Record<ReviewRole, string>;
  policy_version: 'bounded-analysis-policy/1.0.0';
  temperature: 0;
  seed: number | null;
  data_policy: string;
}

export interface ModelRequest {
  schema_version: '1.0.0';
  role: AnalystRole;
  phase: ModelResponse['phase'];
  prompt_version: string;
  policy_version: ProviderManifest['policy_version'];
  context: Json;
  tool_results: ToolResultRecord[];
  validation_errors: string[];
}

export interface ReviewModelRequest {
  schema_version: '1.0.0';
  role: ReviewRole;
  phase: 'review' | 'correction';
  prompt_version: string;
  policy_version: 'evidence-review-policy/1.0.0';
  context: Json;
  validation_errors: string[];
}

export interface ModelProvider {
  readonly manifest: ProviderManifest;
  complete(request: ModelRequest | ReviewModelRequest, signal: AbortSignal): Promise<unknown>;
}

export interface AgentTools {
  call(tool: string, args: Record<string, Json>): Promise<{ structuredContent: Record<string, unknown>; isError?: boolean }>;
}

export interface AnalysisBudgets {
  deadline_ms: 90000;
  max_tool_calls: 24;
  max_input_tokens: 20000;
  max_output_tokens: 4000;
  max_model_calls: 5;
  max_corrections: 1;
}

export interface BudgetUsage {
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  model_calls: number;
  corrections: number;
}

export interface RejectedClaim {
  role: AnalystRole;
  code: string;
}

export interface AnalysisDraft {
  schema_version: '1.0.0';
  draft_id: string;
  status: 'complete' | 'partial' | 'inconclusive';
  question: string;
  baseline: { bundle_id: string; extraction_id: string; trace_id?: string };
  claims: Claim[];
  rejected_claims: RejectedClaim[];
  evidence_ids: string[];
  manifest: {
    input_hash: string;
    chain_id: string;
    snapshot: { chain_id: string; block_hash: string; block_number: string; finality: string } | null;
    corpus_snapshot_ids: string[];
    provider: ProviderManifest | null;
    budgets: { initial: AnalysisBudgets; used: BudgetUsage; remaining: BudgetUsage };
    tool_journal: ToolResultRecord[];
    duration_ms: number;
    policy_version: 'bounded-analysis-policy/1.0.0';
  };
  coverage: { baseline_complete: boolean; analysts_completed: AnalystRole[]; missing: string[] };
  warnings: string[];
  review: { status: 'not_run'; reason: 'ANALYSIS_DRAFT_ONLY' };
}
