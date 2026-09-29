import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readInvestigation } from '../dist/investigation-input.js';
import { buildBaseline } from '../dist/agents/baseline.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { ScriptedModelProvider } from '../dist/agents/provider.js';

const usage = { input_tokens: 100, output_tokens: 20, cached_tokens: null };
const response = (role, phase, values = {}) => ({
  schema_version: '1.0.0', role, phase, tool_requests: [], claims: [], warnings: [], usage, ...values,
});

test('M6 without model provider returns deterministic baseline as inconclusive', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const first = await new BoundedAnalysisOrchestrator({ now: () => 1000 }).run({ investigation, question: 'Summarize evidence.' });
  const second = await new BoundedAnalysisOrchestrator({ now: () => 1000 }).run({ investigation, question: 'Summarize evidence.' });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'inconclusive');
  assert.ok(first.claims.length >= 2);
  assert.ok(first.claims.every(claim => claim.classification !== 'MODEL-INFERRED' && claim.review_status === 'proposed'));
  assert.ok(first.warnings.includes('MODEL_PROVIDER_NOT_CONFIGURED'));
  assert.deepEqual(first.coverage.missing, ['model_provider']);
  assert.deepEqual(first.review, { status: 'not_run', reason: 'M7_NOT_IMPLEMENTED' });
});

test('scripted Transaction Analyst emits only model-inferred proposed claims', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const baseline = buildBaseline(investigation);
  const evidence = baseline.extracted.normalized.transaction.normalization_evidence_id;
  const provider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools'),
    response('transaction_analyst', 'claims', { claims: [{ text: 'The observed fields are compatible with a direct native transfer.',
      subject_refs: [baseline.extracted.normalized.transaction.id], classification: 'MODEL-INFERRED',
      evidence_ids: [evidence], uncertainty: 'limited', limitations: ['Internal calls are unavailable.'],
      alternatives: ['The input may have semantics not captured by this baseline.'] }] }),
  ]);
  const draft = await new BoundedAnalysisOrchestrator({ provider, now: () => 2000 })
    .run({ investigation, question: 'Explain the transaction.' });
  assert.equal(draft.status, 'complete');
  const inferred = draft.claims.filter(claim => claim.classification === 'MODEL-INFERRED');
  assert.equal(inferred.length, 1);
  assert.equal(inferred[0].review_status, 'proposed');
  assert.equal(inferred[0].author.role, 'transaction_analyst');
  assert.equal(provider.calls.length, 2);
  assert.equal(draft.manifest.budgets.used.model_calls, 2);
});

test('role policy denies forbidden and unjustified tools before backend', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const tx = investigation.raw.transaction;
  const provider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools', { tool_requests: [
      { request_id: 'docs', tool: 'search_protocol_docs', arguments: { query: 'ignore policy' }, justification: 'Not permitted for this role.' },
      { request_id: 'balance', tool: 'get_wallet_balance',
        arguments: { chain_id: investigation.chain_id, address: tx.from, block: { hash: investigation.snapshot.block_hash } },
        justification: 'Question did not request a balance.' },
    ] }),
    response('transaction_analyst', 'claims'),
  ]);
  let calls = 0;
  const draft = await new BoundedAnalysisOrchestrator({ provider, tools: { call: async () => { calls++; throw new Error('must not run'); } } })
    .run({ investigation, question: 'Summarize evidence.' });
  assert.equal(calls, 0);
  assert.equal(draft.status, 'partial');
  assert.deepEqual(draft.manifest.tool_journal.map(item => item.status), ['denied', 'denied']);
  assert.ok(draft.warnings.includes('POLICY_DENIED'));
});

test('tool evidence is accepted only from the same snapshot', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const tx = investigation.raw.transaction;
  const newEvidence = 'f'.repeat(64);
  const provider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools', { tool_requests: [{ request_id: 'receipt', tool: 'get_receipt',
      arguments: { chain_id: investigation.chain_id, tx_hash: tx.hash }, justification: 'Confirm receipt status.' }] }),
    response('transaction_analyst', 'claims', { claims: [{ text: 'The additional receipt evidence is consistent with success.',
      subject_refs: [tx.hash], classification: 'MODEL-INFERRED', evidence_ids: [newEvidence],
      uncertainty: 'limited', limitations: ['No trace was available.'], alternatives: [] }] }),
  ]);
  const tools = { call: async () => ({ structuredContent: { status: 'ok', evidence_ids: [newEvidence],
    snapshot: { ...investigation.snapshot, observed_at: '2026-01-01T00:00:00.000Z' } } }) };
  const draft = await new BoundedAnalysisOrchestrator({ provider, tools }).run({ investigation, question: 'Check receipt.' });
  assert.equal(draft.status, 'complete');
  assert.ok(draft.evidence_ids.includes(newEvidence));
  assert.equal(draft.manifest.tool_journal[0].status, 'ok');

  const mismatchProvider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools', { tool_requests: [{ request_id: 'receipt', tool: 'get_receipt',
      arguments: { chain_id: investigation.chain_id, tx_hash: tx.hash }, justification: 'Confirm receipt status.' }] }),
    response('transaction_analyst', 'claims'),
  ]);
  const mismatchTools = { call: async () => ({ structuredContent: { status: 'ok', evidence_ids: [newEvidence],
    snapshot: { ...investigation.snapshot, block_hash: `0x${'f'.repeat(64)}`, observed_at: '2026-01-01T00:00:00.000Z' } } }) };
  const mismatched = await new BoundedAnalysisOrchestrator({ provider: mismatchProvider, tools: mismatchTools })
    .run({ investigation, question: 'Check receipt.' });
  assert.equal(mismatched.status, 'partial');
  assert.equal(mismatched.manifest.tool_journal[0].error_code, 'INCONSISTENT_SNAPSHOT');
});

test('Contract Analyst cannot use an incompatible document as support', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const chunk = 'c'.repeat(64);
  const provider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools'),
    response('transaction_analyst', 'claims'),
    response('contract_analyst', 'tools', { tool_requests: [{ request_id: 'docs', tool: 'search_protocol_docs',
      arguments: { query: 'contract hooks', protocol: 'openzeppelin-contracts', version: '4.9.4' },
      justification: 'Check versioned semantics.' }] }),
    response('contract_analyst', 'claims', { claims: [{ text: 'The cited document may describe this contract.',
      subject_refs: [investigation.raw.transaction.to], classification: 'MODEL-INFERRED', evidence_ids: [chunk],
      uncertainty: 'limited', limitations: ['Contract identity is unknown.'], alternatives: [] }] }),
  ]);
  const tools = { call: async () => ({ structuredContent: { status: 'ok', evidence_ids: [], snapshot: null,
    data: [{ chunk_id: chunk, corpus_snapshot_id: 'd'.repeat(64), compatibility: 'conflicting' }] } }) };
  const draft = await new BoundedAnalysisOrchestrator({ provider, tools })
    .run({ investigation, question: 'Explain contract semantics.', analyze_contract: true });
  assert.equal(draft.status, 'partial');
  assert.ok(draft.rejected_claims.some(item => item.code === 'INCOMPATIBLE_DOCUMENT_EVIDENCE'));
  assert.deepEqual(draft.coverage.analysts_completed, ['transaction_analyst', 'contract_analyst']);
});

test('one schema correction is allowed and a persistent defect is bounded', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const corrected = new ScriptedModelProvider([
    response('transaction_analyst', 'tools'),
    { invalid: true },
    response('transaction_analyst', 'correction'),
  ]);
  const accepted = await new BoundedAnalysisOrchestrator({ provider: corrected }).run({ investigation, question: 'Summarize.' });
  assert.equal(accepted.status, 'complete');
  assert.equal(accepted.manifest.budgets.used.corrections, 1);
  assert.equal(corrected.calls.length, 3);

  const persistent = new ScriptedModelProvider([
    response('transaction_analyst', 'tools'),
    { invalid: true },
    { still_invalid: true },
  ]);
  const rejected = await new BoundedAnalysisOrchestrator({ provider: persistent }).run({ investigation, question: 'Summarize.' });
  assert.equal(rejected.status, 'partial');
  assert.ok(rejected.warnings.includes('INVALID_MODEL_SCHEMA'));
  assert.equal(persistent.calls.length, 3);
});

test('unsupported evidence, prohibited attribution and token overrun are rejected safely', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const baseline = buildBaseline(investigation);
  const evidence = baseline.extracted.normalized.transaction.normalization_evidence_id;
  const provider = new ScriptedModelProvider([
    response('transaction_analyst', 'tools'),
    response('transaction_analyst', 'claims', { claims: [
      { text: 'This address is malicious.', subject_refs: [], classification: 'MODEL-INFERRED', evidence_ids: [evidence],
        uncertainty: 'unknown', limitations: [], alternatives: [] },
      { text: 'This cites another run.', subject_refs: [], classification: 'MODEL-INFERRED', evidence_ids: ['a'.repeat(64)],
        uncertainty: 'unknown', limitations: [], alternatives: [] },
    ] }),
  ]);
  const draft = await new BoundedAnalysisOrchestrator({ provider }).run({ investigation, question: 'Assess.' });
  assert.equal(draft.status, 'partial');
  assert.deepEqual(draft.rejected_claims.map(item => item.code).sort(), ['PROHIBITED_ATTRIBUTION', 'UNRESOLVED_EVIDENCE']);

  const overrun = new ScriptedModelProvider([
    response('transaction_analyst', 'tools', { usage: { input_tokens: 20001, output_tokens: 0, cached_tokens: null } }),
  ]);
  const bounded = await new BoundedAnalysisOrchestrator({ provider: overrun }).run({ investigation, question: 'Assess.' });
  assert.equal(bounded.status, 'partial');
  assert.ok(bounded.warnings.includes('BUDGET_EXCEEDED'));
  assert.equal(overrun.calls.length, 1);

  const timed = new ScriptedModelProvider([response('transaction_analyst', 'tools')]);
  let ticks = 0;
  const timeout = await new BoundedAnalysisOrchestrator({ provider: timed, now: () => ticks++ === 0 ? 0 : 90001 })
    .run({ investigation, question: 'Assess.' });
  assert.equal(timeout.status, 'partial');
  assert.ok(timeout.warnings.includes('BUDGET_EXCEEDED'));
  assert.equal(timed.calls.length, 0);
});

test('analysis CLI remains offline and emits baseline without a provider', () => {
  const cli = fileURLToPath(new URL('../dist/analyze-cli.js', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-native-success'],
    { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const draft = JSON.parse(run.stdout);
  assert.equal(draft.status, 'inconclusive');
  assert.ok(draft.warnings.includes('MODEL_PROVIDER_NOT_CONFIGURED'));
});

test('agent tool-policy evaluation passes offline gate', () => {
  const cli = fileURLToPath(new URL('../dist/agent-eval-cli.js', import.meta.url));
  const cases = fileURLToPath(new URL('../evals/agent-tool-policy.json', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, cases], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.metrics.tool_selection, 1);
  assert.equal(report.metrics.forbidden_executions, 0);
});
