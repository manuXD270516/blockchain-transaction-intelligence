import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareResults, evaluateGates, runEvaluation } from '../dist/evals/runner.js';
import { renderDashboard } from '../dist/evals/dashboard.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const CLEAN = {
  rag: { passed: true, metrics: { cases: 10, recall_at_5: 1, mrr_at_10: 0.9, abstention: 1 } },
  agent: { passed: true, metrics: { cases: 10, tool_selection: 1, forbidden_executions: 0 } },
  review: { passed: true, metrics: { cases: 11, status_accuracy: 1, unresolved_published_evidence: 0, automatic_accusations: 0,
    promoted_inferences: 0, accepted_with_unsupported: 0, forbidden_executions: 0 } },
};

function scripted(overrides = {}) {
  return async name => {
    const value = overrides[name] ?? CLEAN[name];
    if (value instanceof Error) throw value;
    return structuredClone(value);
  };
}

const gate = (result, id) => result.gates.find(item => item.id === id);

test('clean offline run passes every applicable gate with explicit denominators', async () => {
  const result = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted() });
  assert.equal(result.release_blocked, false);
  assert.deepEqual(result.coverage, { planned: 4, executed: 4, invalid: [], completed: 4 });
  assert.ok(Object.values(result.suites).every(status => status === 'ok'));
  assert.equal(result.metrics.reconstruction_f1.value, 1);
  assert.equal(result.metrics.event_f1.value, 1);
  assert.equal(result.metrics.contract_abstention.denominator, 5);
  assert.equal(result.tokens.status, 'unavailable');
  assert.equal(result.latency.model_configured, false);
  assert.ok(result.gates.every(item => item.status !== 'failed'));
  const again = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted() });
  assert.equal(again.result_id, result.result_id);
  assert.equal(again.comparable_key, result.comparable_key);
});

test('metrics without cases stay N/A and their quality gates are not applicable', async () => {
  const result = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted() });
  const metric = result.metrics.contract_identification_precision;
  assert.equal(metric.status, 'N/A');
  assert.equal(metric.value, null);
  assert.equal(metric.denominator, 0);
  assert.equal(gate(result, 'contract_identification_precision_eq_1').status, 'not_applicable');
  assert.equal(gate(result, 'latency_p95_offline_ms_lte_30000_with_model').status, 'not_applicable');
  const gates = evaluateGates({}, { rag: 'ok' });
  assert.ok(gates.filter(item => item.kind === 'safety' && item.metric !== 'suite:rag').every(item => item.status === 'failed'),
    'missing safety metrics must fail closed');
});

test('tampered fixture is reported invalid and blocks release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bti-eval-'));
  try {
    await cp(join(ROOT, 'fixtures'), dir, { recursive: true });
    const receipt = join(dir, 'synthetic-reverted', 'receipt.json');
    await writeFile(receipt, (await readFile(receipt, 'utf8')).replace('"0x0"', '"0x1"'));
    const result = await runEvaluation({ root: ROOT, fixtures_root: dir, latency_repetitions: 1, subeval: scripted() });
    assert.deepEqual(result.coverage.invalid, ['synthetic-reverted']);
    assert.equal(result.config.fixtures['synthetic-reverted'], null);
    assert.equal(result.suites.fixture_integrity, 'error');
    assert.equal(gate(result, 'suite_fixture_integrity_ok').status, 'failed');
    assert.equal(result.release_blocked, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('policy violation in a sub-eval blocks release even with perfect quality', async () => {
  const result = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted({
    agent: { passed: false, metrics: { cases: 10, tool_selection: 1, forbidden_executions: 1 } } }) });
  assert.equal(gate(result, 'agent_forbidden_executions_zero').status, 'failed');
  assert.equal(gate(result, 'tool_selection_gte_0.95').status, 'passed');
  assert.equal(result.release_blocked, true);
});

test('crashing or malformed sub-eval marks the suite as error and metrics unavailable', async () => {
  const result = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted({
    rag: new Error('boom'), review: { metrics: 'not-an-object' } }) });
  assert.equal(result.suites.rag, 'error');
  assert.equal(result.suites.review, 'error');
  assert.equal(result.metrics.retrieval_recall_at_5.status, 'unavailable');
  assert.equal(result.metrics.review_forbidden_executions.status, 'unavailable');
  assert.equal(gate(result, 'review_forbidden_executions_zero').status, 'failed');
  assert.equal(result.release_blocked, true);
});

test('comparison refuses results with different comparable keys and diffs matching ones', async () => {
  const a = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted() });
  const b = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted({
    rag: { passed: true, metrics: { cases: 10, recall_at_5: 0.8, mrr_at_10: 0.9, abstention: 1 } } }) });
  const same = compareResults(a, b);
  assert.equal(same.comparable, true);
  const recall = same.diffs.find(item => item.metric === 'retrieval_recall_at_5');
  assert.ok(Math.abs(recall.delta + 0.2) < 1e-9);
  assert.ok(same.gate_changes.some(item => item.gate === 'retrieval_recall_at_5_gte_0.85' && item.b === 'failed'));
  const other = compareResults(a, { ...b, comparable_key: '0'.repeat(64) });
  assert.deepEqual(other, { comparable: false, reason: 'COMPARABLE_KEY_MISMATCH', diffs: [] });
});

test('dashboard is inert static HTML that escapes result content', async () => {
  const result = await runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: scripted() });
  const hostile = '<script>alert(1)</script>';
  const html = renderDashboard({ ...result, golden_version: hostile });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/<script/i.test(html));
  assert.ok(!/\son[a-z]+\s*=/i.test(html));
  assert.ok(!/\b(?:https?|javascript):/i.test(html));
});

test('eval CLI runs real sub-evals offline under the network guard', () => {
  const cli = join(ROOT, 'dist', 'eval-cli.js');
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'run', '--repetitions', '1'], { encoding: 'utf8', timeout: 240000 });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.release_blocked, false);
  assert.ok(Object.values(result.suites).every(status => status === 'ok'));
  const bad = spawnSync(process.execPath, ['--import', guard, cli, 'run', '--repetitions', '0'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'INVALID_INPUT');
});
