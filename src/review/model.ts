import * as z from 'zod';
import { AgentValidationError } from '../agents/claims.js';
import type { ReviewRole } from '../agents/types.js';
import { canonical } from '../normalization/evidence.js';
import { FINDING_CODES, REVIEW_REASONS } from './types.js';
import type { EvidenceAgentResponse, ReviewerResponse } from './types.js';

export class ReviewPolicyError extends Error {
  readonly code = 'POLICY_DENIED';
  constructor() { super('POLICY_DENIED'); this.name = 'ReviewPolicyError'; }
}

const id = z.string().regex(/^[0-9a-f]{64}$/);
const usage = z.strictObject({ input_tokens: z.number().int().nonnegative().max(1000000),
  output_tokens: z.number().int().nonnegative().max(1000000),
  cached_tokens: z.union([z.number().int().nonnegative().max(1000000), z.null()]) });
const evidenceRequest = z.strictObject({ claim_id: id, evidence_id: id, reason: z.string().min(1).max(500) });
const common = { schema_version: z.literal('1.0.0'), phase: z.enum(['review', 'correction']),
  evidence_requests: z.array(evidenceRequest).max(50), tool_requests: z.array(z.unknown()).max(24),
  warnings: z.array(z.string().min(1).max(200)).max(50), usage };
const evidenceSchema = z.strictObject({ ...common, role: z.literal('evidence_agent'),
  findings: z.array(z.strictObject({ claim_id: id, code: z.enum(FINDING_CODES) })).max(500) });
const reviewerSchema = z.strictObject({ ...common, role: z.literal('reviewer'),
  verdicts: z.array(z.strictObject({ claim_id: id, verdict: z.enum(['supported', 'rejected', 'needs_revision']),
    reasons: z.array(z.enum(REVIEW_REASONS)).min(1).max(8) })).max(200) });

export function validateReviewResponse(value: unknown, role: 'evidence_agent', phase: 'review' | 'correction',
  claims: ReadonlySet<string>): EvidenceAgentResponse;
export function validateReviewResponse(value: unknown, role: 'reviewer', phase: 'review' | 'correction',
  claims: ReadonlySet<string>): ReviewerResponse;
export function validateReviewResponse(value: unknown, role: ReviewRole, phase: 'review' | 'correction',
  claims: ReadonlySet<string>): EvidenceAgentResponse | ReviewerResponse {
  const parsed = (role === 'evidence_agent' ? evidenceSchema : reviewerSchema).safeParse(value);
  if (!parsed.success) throw new AgentValidationError(['INVALID_REVIEW_SCHEMA']);
  const response = parsed.data;
  if (response.phase !== phase) throw new AgentValidationError(['INVALID_REVIEW_PHASE']);
  if (response.tool_requests.length) throw new ReviewPolicyError();
  try { canonical(response); } catch { throw new AgentValidationError(['INVALID_REVIEW_JSON']); }
  const errors = new Set<string>();
  if (response.evidence_requests.some(request => !claims.has(request.claim_id))) errors.add('UNKNOWN_CLAIM_REFERENCE');
  if (response.role === 'evidence_agent') {
    if (response.findings.some(finding => !claims.has(finding.claim_id))) errors.add('UNKNOWN_CLAIM_REFERENCE');
    const covered = new Set(response.findings.map(finding => finding.claim_id));
    if ([...claims].some(claim => !covered.has(claim))) errors.add('MISSING_FINDING');
  } else {
    const seen = new Set<string>();
    for (const verdict of response.verdicts) {
      if (!claims.has(verdict.claim_id)) errors.add('UNKNOWN_CLAIM_REFERENCE');
      if (seen.has(verdict.claim_id)) errors.add('DUPLICATE_VERDICT');
      seen.add(verdict.claim_id);
      const entailed = verdict.reasons.includes('ENTAILED');
      if (verdict.verdict === 'supported' ? verdict.reasons.length !== 1 || !entailed : entailed) {
        errors.add('INCONSISTENT_VERDICT_REASONS');
      }
    }
    if ([...claims].some(claim => !seen.has(claim))) errors.add('MISSING_VERDICT');
  }
  if (errors.size) throw new AgentValidationError([...errors].sort());
  return response as EvidenceAgentResponse | ReviewerResponse;
}
