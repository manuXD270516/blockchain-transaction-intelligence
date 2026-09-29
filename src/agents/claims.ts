import * as z from 'zod';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';
import type { AnalystRole, Claim, ModelClaim, ModelResponse, ProviderManifest } from './types.js';

export class AgentValidationError extends Error {
  constructor(public readonly codes: string[]) { super('MODEL_OUTPUT_REJECTED'); this.name = 'AgentValidationError'; }
}

const usage = z.strictObject({ input_tokens: z.number().int().nonnegative().max(1000000),
  output_tokens: z.number().int().nonnegative().max(1000000),
  cached_tokens: z.union([z.number().int().nonnegative().max(1000000), z.null()]) });
const toolRequest = z.strictObject({ request_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  tool: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()), justification: z.string().min(1).max(1000) });
const modelClaimSchema = z.strictObject({ text: z.string().min(1).max(2000), subject_refs: z.array(z.string().min(1).max(300)).max(50),
  classification: z.literal('MODEL-INFERRED'), evidence_ids: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(100),
  uncertainty: z.enum(['supported', 'limited', 'unknown']), limitations: z.array(z.string().min(1).max(500)).max(20),
  alternatives: z.array(z.string().min(1).max(500)).max(20) });
const responseSchema = z.strictObject({ schema_version: z.literal('1.0.0'),
  role: z.enum(['transaction_analyst', 'contract_analyst']), phase: z.enum(['tools', 'claims', 'correction']),
  tool_requests: z.array(toolRequest).max(24), claims: z.array(modelClaimSchema).max(50),
  warnings: z.array(z.string().min(1).max(200)).max(50), usage });

export function validateModelResponse(value: unknown, role: AnalystRole, phase: ModelResponse['phase']): ModelResponse {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new AgentValidationError(['INVALID_MODEL_SCHEMA']);
  if (parsed.data.role !== role || parsed.data.phase !== phase) throw new AgentValidationError(['INVALID_MODEL_PHASE']);
  try { canonical(parsed.data); } catch { throw new AgentValidationError(['INVALID_MODEL_JSON']); }
  return parsed.data as ModelResponse;
}

export function modelClaim(value: ModelClaim, role: AnalystRole, provider: ProviderManifest,
  evidence: ReadonlySet<string>, blockedEvidence: ReadonlySet<string> = new Set()): Claim {
  const errors: string[] = [];
  if (value.evidence_ids.some(id => !evidence.has(id))) errors.push('UNRESOLVED_EVIDENCE');
  if (value.evidence_ids.some(id => blockedEvidence.has(id))) errors.push('INCOMPATIBLE_DOCUMENT_EVIDENCE');
  if (forbidden(value.text)) errors.push('PROHIBITED_ATTRIBUTION');
  if (new Set(value.evidence_ids).size !== value.evidence_ids.length) errors.push('DUPLICATE_EVIDENCE');
  if (errors.length) throw new AgentValidationError(errors);
  return claim({
    text: value.text, subject_refs: value.subject_refs, classification: 'MODEL-INFERRED',
    evidence_ids: value.evidence_ids, derivation: null, uncertainty: value.uncertainty,
    limitations: value.limitations, alternatives: value.alternatives,
    author: { role, provider: provider.provider, model: provider.model, prompt_version: provider.prompt_versions[role] },
  });
}

export function claim(value: Omit<Claim, 'schema_version' | 'claim_id' | 'review_status'>): Claim {
  const body = { schema_version: '1.0.0' as const, ...value, review_status: 'proposed' as const };
  return { ...body, claim_id: sha256(canonical(body)) };
}

function forbidden(text: string): boolean {
  return /\b(?:fraud(?:ulent)?|scam(?:mer)?|malicious|criminal|owned by|controlled by|intended to)\b/i.test(text);
}
