import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import type { Investigation } from './adapters/contracts.js';
import { buildBaseline } from './agents/baseline.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { ScriptedModelProvider } from './agents/provider.js';
import type { ReviewModelRequest } from './agents/types.js';
import { readInvestigation } from './investigation-input.js';
import { parseCorpusJson } from './rag/validation.js';
import { hasProhibitedLanguage } from './review/evidence.js';
import type { ReviewedReport } from './review/types.js';

const SCENARIOS = ['accepted-inferred', 'not-entailed', 'unusual-wallet-language', 'event-overreach', 'evidence-contradiction',
  'reviewer-tool-request', 'reviewer-corrected', 'reviewer-persistent-invalid', 'no-provider', 'review-budget',
  'unresolved-request'] as const;
type Scenario = typeof SCENARIOS[number];
const schema = z.strictObject({
  schema_version: z.literal('1.0.0'),
  cases: z.array(z.strictObject({ id: z.string(), scenario: z.enum(SCENARIOS), fixture_id: z.string(),
    expected_status: z.enum(['accepted', 'partial', 'inconclusive']) })).min(1),
});
const usage = { input_tokens: 10, output_tokens: 5, cached_tokens: null };
type ClaimView = { claim_id: string };
const claimsOf = (request: ReviewModelRequest) => (request.context as { claims: ClaimView[] }).claims;
const analyst = (phase: 'tools' | 'claims', claims: unknown[] = []) => ({
  schema_version: '1.0.0', role: 'transaction_analyst', phase, tool_requests: [], claims, warnings: [], usage,
});
const evidenceAgent = (code: (claim: ClaimView) => string = () => 'REFERENCES_RESOLVED') => (request: ReviewModelRequest) => ({
  schema_version: '1.0.0', role: 'evidence_agent', phase: request.phase, evidence_requests: [], tool_requests: [], warnings: [], usage,
  findings: claimsOf(request).map(claim => ({ claim_id: claim.claim_id, code: code(claim) })),
});
const reviewer = (options: { verdict?: (claim: ClaimView) => [string, string[]]; extra?: Record<string, unknown>;
  output_tokens?: number } = {}) => (request: ReviewModelRequest) => ({
  schema_version: '1.0.0', role: 'reviewer', phase: request.phase, evidence_requests: [], tool_requests: [], warnings: [],
  usage: { ...usage, output_tokens: options.output_tokens ?? usage.output_tokens },
  verdicts: claimsOf(request).map(claim => {
    const [verdict, reasons] = options.verdict?.(claim) ?? ['supported', ['ENTAILED']];
    return { claim_id: claim.claim_id, verdict, reasons };
  }), ...options.extra,
});
const inferred = (text: string, evidence: string) => ({ text, subject_refs: [], classification: 'MODEL-INFERRED',
  evidence_ids: [evidence], uncertainty: 'limited', limitations: ['Internal calls are unavailable.'],
  alternatives: ['The data may have semantics not captured by this baseline.'] });

function script(scenario: Scenario, investigation: Investigation): unknown[] | null {
  const baseline = buildBaseline(investigation);
  const txEvidence = baseline.extracted.normalized.transaction!.normalization_evidence_id;
  const direct = inferred('The observed fields are compatible with a direct native transfer.', txEvidence);
  const isInferred = (claim: ClaimView, request: ReviewModelRequest) =>
    (request.context as { claims: { claim_id: string; classification: string }[] }).claims
      .find(item => item.claim_id === claim.claim_id)?.classification === 'MODEL-INFERRED';
  switch (scenario) {
    case 'no-provider': return null;
    case 'accepted-inferred': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(), reviewer()];
    case 'not-entailed': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(), (request: ReviewModelRequest) =>
      reviewer({ verdict: claim => isInferred(claim, request) ? ['rejected', ['NOT_ENTAILED']] : ['supported', ['ENTAILED']] })(request)];
    case 'unusual-wallet-language': return [analyst('tools'),
      analyst('claims', [inferred('This transfer is unusual for this wallet.', txEvidence)]), evidenceAgent(), reviewer()];
    case 'event-overreach': return [analyst('tools'), analyst('claims', [inferred('The recipient owns the transferred tokens.',
      baseline.extracted.transfers[0]!.evidence_ids[1]!)]), evidenceAgent(), reviewer()];
    case 'evidence-contradiction': return [analyst('tools'), analyst('claims', [direct]), (request: ReviewModelRequest) =>
      evidenceAgent(claim => isInferred(claim, request) ? 'CONTRADICTION' : 'REFERENCES_RESOLVED')(request), reviewer()];
    case 'reviewer-tool-request': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(),
      reviewer({ extra: { tool_requests: [{ request_id: 'escalate', tool: 'get_receipt', arguments: {}, justification: 'More data.' }] } })];
    case 'reviewer-corrected': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(), { invalid: true }, reviewer()];
    case 'reviewer-persistent-invalid': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(), { invalid: true },
      { still_invalid: true }];
    case 'review-budget': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(), reviewer({ output_tokens: 5000 })];
    case 'unresolved-request': return [analyst('tools'), analyst('claims', [direct]), evidenceAgent(),
      (request: ReviewModelRequest) => ({ ...reviewer()(request),
        evidence_requests: [{ claim_id: claimsOf(request)[0]!.claim_id, evidence_id: 'a'.repeat(64), reason: 'Needs parent.' }] })];
  }
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error('INVALID_INPUT');
  const parsed = schema.safeParse(parseCorpusJson(await readFile(path)));
  if (!parsed.success) throw new Error('INVALID_EVAL');
  let correct = 0; let unresolved = 0; let accusations = 0; let promoted = 0; let acceptedUnsupported = 0; let forbidden = 0;
  const results = [];
  for (const item of parsed.data.cases) {
    const investigation = await readInvestigation('fixture', item.fixture_id);
    const responses = script(item.scenario, investigation);
    let backendCalls = 0;
    const tools = { call: async () => { backendCalls++; throw new Error('REVIEW_MUST_NOT_CALL_TOOLS'); } };
    const orchestrator = new BoundedAnalysisOrchestrator(responses
      ? { provider: new ScriptedModelProvider(responses), tools, now: () => 0 } : { tools, now: () => 0 });
    const report: ReviewedReport = await orchestrator.runReviewed({ investigation, question: 'Review the supported evidence.' });
    if (report.status === item.expected_status) correct++;
    const kinds = new Map(report.claim_evidence.map(row => [row.claim_id, row.evidence]));
    unresolved += report.conclusions.flatMap(claim => kinds.get(claim.claim_id) ?? []).filter(row => row.kind === 'unresolved').length;
    accusations += [...report.conclusions.map(claim => claim.text), ...report.anomalies.map(anomaly => anomaly.label)]
      .filter(hasProhibitedLanguage).length;
    promoted += report.conclusions.filter(claim => claim.author.role !== 'baseline' && claim.classification !== 'MODEL-INFERRED').length;
    if (report.status === 'accepted' && (report.audit.claims.length || report.audit.analysis_rejections.length
      || report.validated_facts.length)) acceptedUnsupported++;
    forbidden += backendCalls;
    results.push({ id: item.id, expected: item.expected_status, actual: report.status, supported: report.summary.supported,
      rejected: report.summary.rejected, needs_revision: report.summary.needs_revision });
  }
  const statusAccuracy = correct / parsed.data.cases.length;
  const passed = statusAccuracy === 1 && unresolved === 0 && accusations === 0 && promoted === 0
    && acceptedUnsupported === 0 && forbidden === 0;
  process.stdout.write(`${JSON.stringify({ schema_version: '1.0.0', passed, metrics: { status_accuracy: statusAccuracy,
    unresolved_published_evidence: unresolved, automatic_accusations: accusations, promoted_inferences: promoted,
    accepted_with_unsupported: acceptedUnsupported, forbidden_executions: forbidden, cases: parsed.data.cases.length }, results })}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ error: { code: 'REVIEW_EVALUATION_FAILED' } })}\n`);
  process.exitCode = 1;
});
