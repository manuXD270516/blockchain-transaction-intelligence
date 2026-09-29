import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readInvestigation } from '../dist/investigation-input.js';
import { buildBaseline, EVENT_COUNT_RULE } from '../dist/agents/baseline.js';
import { claim } from '../dist/agents/claims.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { ScriptedModelProvider } from '../dist/agents/provider.js';
import { deriveAnomalies } from '../dist/review/anomalies.js';
import { hasProhibitedLanguage } from '../dist/review/evidence.js';
import { EvidenceReviewPipeline } from '../dist/review/pipeline.js';

const usage = { input_tokens: 10, output_tokens: 5, cached_tokens: null };
const analyst = (phase, claims = []) => ({ schema_version: '1.0.0', role: 'transaction_analyst', phase,
  tool_requests: [], claims, warnings: [], usage });
const evidenceAgent = (code = () => 'REFERENCES_RESOLVED') => request => ({ schema_version: '1.0.0', role: 'evidence_agent',
  phase: request.phase, evidence_requests: [], tool_requests: [], warnings: [], usage,
  findings: request.context.claims.map(item => ({ claim_id: item.claim_id, code: code(item) })) });
const reviewer = (extra = {}) => request => ({ schema_version: '1.0.0', role: 'reviewer', phase: request.phase,
  evidence_requests: [], tool_requests: [], warnings: [], usage,
  verdicts: request.context.claims.map(item => ({ claim_id: item.claim_id, verdict: 'supported', reasons: ['ENTAILED'] })), ...extra });
const inferred = (text, evidence) => ({ text, subject_refs: [], classification: 'MODEL-INFERRED', evidence_ids: [evidence],
  uncertainty: 'limited', limitations: ['Internal calls are unavailable.'], alternatives: ['Other semantics may apply.'] });

async function nativeSuccess() {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const baseline = buildBaseline(investigation);
  return { investigation, baseline, txEvidence: baseline.extracted.normalized.transaction.normalization_evidence_id };
}

test('M7 without provider keeps validated baseline facts and is inconclusive', async () => {
  const { investigation } = await nativeSuccess();
  const first = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize.' });
  const second = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize.' });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'inconclusive');
  assert.equal(first.mode, 'synthetic');
  assert.equal(first.conclusions.length, 0);
  assert.ok(first.validated_facts.length >= 2);
  assert.ok(first.validated_facts.every(item => item.review_status === 'proposed' && item.author.role === 'baseline'));
  assert.deepEqual(first.coverage.review_missing, ['evidence_agent', 'reviewer']);
  for (const warning of ['MODEL_PROVIDER_NOT_CONFIGURED', 'REVIEW_IS_NOT_A_SECURITY_AUDIT', 'SYNTHETIC_DATA']) {
    assert.ok(first.warnings.includes(warning), warning);
  }
  assert.ok(first.timeline.map(item => item.kind).join(',').startsWith('block,transaction,receipt'));
  assert.ok(first.entities.every(item => item.identity === 'unknown'));
});

test('supported inferred claim yields an accepted report without promotion or tools', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const provider = new ScriptedModelProvider([analyst('tools'),
    analyst('claims', [inferred('The observed fields are compatible with a direct native transfer.', txEvidence)]),
    evidenceAgent(), reviewer()]);
  let backend = 0;
  const report = await new BoundedAnalysisOrchestrator({ provider, now: () => 0,
    tools: { call: async () => { backend++; throw new Error('no tools'); } } })
    .runReviewed({ investigation, question: 'Explain the transaction.' });
  assert.equal(report.status, 'accepted');
  assert.equal(backend, 0);
  assert.deepEqual(provider.calls.map(call => call.role), ['transaction_analyst', 'transaction_analyst', 'evidence_agent', 'reviewer']);
  assert.ok(provider.calls.slice(2).every(call => call.policy_version === 'evidence-review-policy/1.0.0' && !('tool_results' in call)));
  const model = report.conclusions.filter(item => item.author.role === 'transaction_analyst');
  assert.equal(model.length, 1);
  assert.equal(model[0].classification, 'MODEL-INFERRED');
  assert.equal(model[0].review_status, 'supported');
  assert.equal(report.budgets.review.model_calls, 2);
  assert.ok(!report.warnings.includes('REVIEW_NOT_RUN'));
  assert.equal(report.audit.claims.length, 0);
  assert.ok(report.claim_evidence.every(row => row.evidence.every(item => item.kind !== 'unresolved')));
});

test('deterministic validators reject overreach and prohibited language even when reviewer supports', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const provider = new ScriptedModelProvider([analyst('tools'),
    analyst('claims', [inferred('This transfer is unusual for this wallet.', txEvidence)]), evidenceAgent(), reviewer()]);
  const report = await new BoundedAnalysisOrchestrator({ provider, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(report.status, 'inconclusive');
  const rejected = report.audit.claims.find(item => item.review_status === 'rejected');
  assert.deepEqual(rejected.review_reasons, ['PROHIBITED_ATTRIBUTION']);
  assert.ok(!report.conclusions.some(item => hasProhibitedLanguage(item.text)));
  assert.ok(provider.calls[2].context.claims.every(item => item.claim_id !== rejected.claim_id));

  const tokens = await readInvestigation('fixture', 'synthetic-token-events');
  const transfer = buildBaseline(tokens).extracted.transfers[0];
  const overreach = new ScriptedModelProvider([analyst('tools'),
    analyst('claims', [inferred('The recipient owns the transferred tokens.', transfer.evidence_ids[1])]), evidenceAgent(), reviewer()]);
  const events = await new BoundedAnalysisOrchestrator({ provider: overreach, now: () => 0 }).runReviewed({ investigation: tokens, question: 'Assess.' });
  assert.equal(events.status, 'inconclusive');
  assert.deepEqual(events.audit.claims.map(item => item.review_reasons), [['EVENT_OVERREACH']]);
  assert.ok(events.transfers.every(item => item.semantics === 'event_reported'));
});

test('tampered or incoherent draft claims are rejected before the reviewer sees them', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const orchestrator = new BoundedAnalysisOrchestrator({ now: () => 0 });
  const draft = await orchestrator.run({ investigation, question: 'Summarize.' });
  const author = { role: 'transaction_analyst', provider: 'scripted-offline', model: 'fixture-responder', prompt_version: 'transaction-analyst/1.0.0' };
  const promoted = claim({ text: 'The transaction was a direct transfer.', subject_refs: [], classification: 'OBSERVED',
    evidence_ids: [txEvidence], derivation: null, uncertainty: 'supported', limitations: [], alternatives: [], author });
  const foreign = claim({ text: 'Another run reports a transfer.', subject_refs: [], classification: 'MODEL-INFERRED',
    evidence_ids: ['a'.repeat(64)], derivation: null, uncertainty: 'limited', limitations: ['x'], alternatives: [], author });
  const stale = { ...draft.claims[0], text: `${draft.claims[0].text} Edited.` };
  const provider = new ScriptedModelProvider([evidenceAgent(), reviewer()]);
  const tampered = { ...draft, claims: [stale, ...draft.claims.slice(1), promoted, foreign],
    manifest: { ...draft.manifest, provider: provider.manifest } };
  const report = await new EvidenceReviewPipeline({ provider, now: () => 0 })
    .review({ investigation, draft: tampered, started_at: 0 });
  const reasons = Object.fromEntries(report.audit.claims.map(item => [item.claim_id, item.review_reasons]));
  assert.deepEqual(reasons[stale.claim_id], ['CLAIM_ID_MISMATCH']);
  assert.deepEqual(reasons[promoted.claim_id], ['CLASS_INCOHERENT']);
  assert.deepEqual(reasons[foreign.claim_id], ['UNRESOLVED_EVIDENCE']);
  assert.equal(report.status, 'inconclusive');
  const reviewed = provider.calls[1].context.claims.map(item => item.claim_id);
  assert.ok(![stale.claim_id, promoted.claim_id, foreign.claim_id].some(id => reviewed.includes(id)));

  const other = await readInvestigation('fixture', 'synthetic-reverted');
  await assert.rejects(new EvidenceReviewPipeline({ now: () => 0 }).review({ investigation: other, draft, started_at: 0 }),
    error => error.code === 'DRAFT_INPUT_MISMATCH');
});

test('Evidence Agent findings and unresolved requests override reviewer support', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const direct = inferred('The observed fields are compatible with a direct native transfer.', txEvidence);
  const contradiction = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]),
    evidenceAgent(item => item.classification === 'MODEL-INFERRED' ? 'CONTRADICTION' : 'REFERENCES_RESOLVED'), reviewer()]);
  const rejected = await new BoundedAnalysisOrchestrator({ provider: contradiction, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(rejected.status, 'inconclusive');
  assert.deepEqual(rejected.audit.claims.map(item => [item.review_status, item.review_reasons]), [['rejected', ['CONTRADICTION', 'ENTAILED']]]);

  const missing = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]), evidenceAgent(),
    request => ({ ...reviewer()(request), evidence_requests: [{ claim_id: request.context.claims[0].claim_id,
      evidence_id: 'b'.repeat(64), reason: 'Parent evidence needed.' }] })]);
  const revision = await new BoundedAnalysisOrchestrator({ provider: missing, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(revision.status, 'inconclusive');
  assert.equal(revision.summary.needs_revision, 1);
  assert.ok(revision.review_journal.some(item => item.role === 'reviewer' && item.code === 'EVIDENCE_REQUEST_UNRESOLVED'));
});

test('review tools are denied and the correction budget is shared with analysts', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const direct = inferred('The observed fields are compatible with a direct native transfer.', txEvidence);
  const escalation = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]), evidenceAgent(),
    reviewer({ tool_requests: [{ request_id: 'x', tool: 'get_receipt', arguments: {}, justification: 'More data.' }] })]);
  let backend = 0;
  const denied = await new BoundedAnalysisOrchestrator({ provider: escalation, now: () => 0,
    tools: { call: async () => { backend++; return { structuredContent: {} }; } } }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(backend, 0);
  assert.equal(denied.status, 'inconclusive');
  assert.equal(denied.coverage.reviewer, 'failed');
  assert.deepEqual(denied.review_journal, [{ role: 'reviewer', code: 'POLICY_DENIED' }]);

  const shared = new ScriptedModelProvider([analyst('tools'), { invalid: true }, analyst('correction', [direct]),
    evidenceAgent(), { invalid: true }]);
  const exhausted = await new BoundedAnalysisOrchestrator({ provider: shared, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(shared.calls.length, 5);
  assert.equal(exhausted.status, 'inconclusive');
  assert.equal(exhausted.budgets.review.corrections, 0);
  assert.ok(exhausted.warnings.includes('REVIEW_OUTPUT_REJECTED'));

  const corrected = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]), evidenceAgent(), { invalid: true }, reviewer()]);
  const accepted = await new BoundedAnalysisOrchestrator({ provider: corrected, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.budgets.review.corrections, 1);
  assert.equal(corrected.calls[4].phase, 'correction');
});

test('review respects the shared deadline and output token budget', async () => {
  const { investigation, txEvidence } = await nativeSuccess();
  const direct = inferred('The observed fields are compatible with a direct native transfer.', txEvidence);
  const tokens = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]), evidenceAgent(),
    request => ({ ...reviewer()(request), usage: { input_tokens: 10, output_tokens: 4000, cached_tokens: null } })]);
  const overrun = await new BoundedAnalysisOrchestrator({ provider: tokens, now: () => 0 }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(overrun.status, 'inconclusive');
  assert.ok(overrun.warnings.includes('BUDGET_EXCEEDED'));

  let clock = 0;
  const late = new ScriptedModelProvider([analyst('tools'), analyst('claims', [direct]), evidenceAgent(), reviewer()]);
  const provider = { manifest: late.manifest, complete: async (request, signal) => {
    const value = await late.complete(request, signal);
    if (request.role === 'transaction_analyst' && request.phase === 'claims') clock = 90001;
    return value;
  } };
  const timeout = await new BoundedAnalysisOrchestrator({ provider, now: () => clock }).runReviewed({ investigation, question: 'Assess.' });
  assert.equal(timeout.status, 'inconclusive');
  assert.equal(late.calls.length, 2);
  assert.ok(timeout.warnings.includes('BUDGET_EXCEEDED'));
});

test('anomalies reference published claims with allowed classes and no attribution', async () => {
  const reverted = await readInvestigation('fixture', 'synthetic-reverted');
  const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation: reverted, question: 'Summarize.' });
  const published = new Set([...report.conclusions, ...report.validated_facts].map(item => item.claim_id));
  assert.deepEqual(report.anomalies.map(item => [item.label, item.classification]), [['receipt_reports_reverted', 'OBSERVED']]);
  assert.ok(report.anomalies.every(item => published.has(item.claim_id) && !hasProhibitedLanguage(item.label)));

  const author = { role: 'baseline', provider: null, model: null, prompt_version: 'deterministic-baseline/1.0.0' };
  const threshold = { ...claim({ text: 'The educational event-count rule counts 25 standard transfer events in this receipt.',
    subject_refs: [], classification: 'RULE-BASED', evidence_ids: ['c'.repeat(64)],
    derivation: { rule: EVENT_COUNT_RULE.id, version: EVENT_COUNT_RULE.version }, uncertainty: 'supported',
    limitations: [], alternatives: [], author }), review_status: 'supported', review_reasons: ['ENTAILED'] };
  const [anomaly] = deriveAnomalies([threshold], { receipt_evidence_id: null, receipt_status: 'success' });
  assert.equal(anomaly.classification, 'RULE-BASED');
  assert.deepEqual(anomaly.rule, { id: EVENT_COUNT_RULE.id, version: '1.0.0', threshold: 20, window: 'single-transaction-receipt' });
  assert.ok(anomaly.limitations.some(item => item.includes('does not prove harm')));
});

test('report CLI remains offline and emits an inconclusive reviewed report', () => {
  const cli = fileURLToPath(new URL('../dist/report-cli.js', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-native-success'],
    { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.replay_manifest.validator_version, 'evidence-review-validators/1.0.0');
  assert.ok(report.warnings.includes('REVIEW_IS_NOT_A_SECURITY_AUDIT'));
});

test('review evaluation passes offline gates', () => {
  const cli = fileURLToPath(new URL('../dist/review-eval-cli.js', import.meta.url));
  const cases = fileURLToPath(new URL('../evals/review-cases.json', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, cases], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.metrics.status_accuracy, 1);
  assert.equal(report.metrics.accepted_with_unsupported, 0);
  assert.equal(report.metrics.forbidden_executions, 0);
});
