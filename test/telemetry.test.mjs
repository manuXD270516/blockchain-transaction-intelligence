import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInvestigation } from '../dist/investigation-input.js';
import { buildBaseline } from '../dist/agents/baseline.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { ScriptedModelProvider } from '../dist/agents/provider.js';
import { redact, redactString } from '../dist/telemetry/redact.js';
import { MAX_SPANS, toOtlpJson, Tracer } from '../dist/telemetry/tracer.js';
import { RETENTION_MS, RunStore } from '../dist/runs/store.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const usage = { input_tokens: 10, output_tokens: 5, cached_tokens: null };
const analyst = (phase, extra = {}) => ({ schema_version: '1.0.0', role: 'transaction_analyst', phase,
  tool_requests: [], claims: [], warnings: [], usage, ...extra });
const evidenceAgent = request => ({ schema_version: '1.0.0', role: 'evidence_agent', phase: request.phase, evidence_requests: [],
  tool_requests: [], warnings: [], usage, findings: request.context.claims.map(item => ({ claim_id: item.claim_id, code: 'REFERENCES_RESOLVED' })) });
const reviewer = request => ({ schema_version: '1.0.0', role: 'reviewer', phase: request.phase, evidence_requests: [],
  tool_requests: [], warnings: [], usage,
  verdicts: request.context.claims.map(item => ({ claim_id: item.claim_id, verdict: 'supported', reasons: ['ENTAILED'] })) });
const SECRET_ERROR = 'connect failed https://user:hunter2@rpc.example.org/v3/0123456789abcdef0123456789abcdef?apikey=sk-live-123&chain=1 '
  + 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';

function ids() {
  let n = 0;
  return bytes => (++n).toString(16).padStart(bytes * 2, '0');
}

async function scenario() {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  const baseline = buildBaseline(investigation);
  const tx = baseline.extracted.normalized.transaction;
  const claim = { text: 'The observed fields are compatible with a direct native transfer.', subject_refs: [],
    classification: 'MODEL-INFERRED', evidence_ids: [tx.normalization_evidence_id], uncertainty: 'limited',
    limitations: ['Internal calls are unavailable.'], alternatives: ['Other semantics may apply.'] };
  const toolRequests = [{ request_id: 'r1', tool: 'get_receipt', arguments: { chain_id: investigation.chain_id, tx_hash: tx.fields.hash },
    justification: 'Confirm execution status.' }, { request_id: 'r2', tool: 'transfer_funds', arguments: {}, justification: 'Not allowed.' }];
  return { investigation, claim, toolRequests };
}

test('redaction removes credentials, keeps useful context and is idempotent', () => {
  const out = redactString(SECRET_ERROR);
  for (const secret of ['hunter2', '0123456789abcdef0123456789abcdef', 'sk-live-123', 'eyJhbGciOiJIUzI1NiJ9']) assert.ok(!out.includes(secret), secret);
  assert.ok(out.includes('connect failed') && out.includes('rpc.example.org') && out.includes('chain=1'));
  assert.equal(redactString(out), out);
  assert.equal(redactString('token=abc; password: "p4ss" api_key=xyz'), 'token=[REDACTED]; password: "[REDACTED]" api_key=[REDACTED]');
  assert.deepEqual(redact({ headers: { Authorization: 'Bearer x', 'X-API-Key': 'k' }, token_address: '0xabc', token: 'secret', nested: [{ password: 'p' }] }),
    { headers: { Authorization: '[REDACTED]', 'X-API-Key': '[REDACTED]' }, token_address: '0xabc', token: '[REDACTED]', nested: [{ password: '[REDACTED]' }] });
  const hash = `0x${'ab'.repeat(32)}`;
  assert.equal(redactString(`tx ${hash} at https://rpc.example.org/v3/${hash}`), `tx ${hash} at https://rpc.example.org/v3/${hash}`);
});

test('public fixture reports survive redaction unchanged', async () => {
  for (const fixture of ['synthetic-token-events', 'synthetic-reverted', 'synthetic-native-success']) {
    const investigation = await readInvestigation('fixture', fixture);
    const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize.' });
    assert.deepEqual(redact(report), report, fixture);
  }
});

test('reviewed run yields one correlated trace with budgets and versions, report unchanged', async () => {
  const { investigation, claim, toolRequests } = await scenario();
  const script = () => [analyst('tools', { tool_requests: toolRequests }), analyst('claims', { claims: [claim] }), evidenceAgent, reviewer];
  const tools = { call: async () => ({ structuredContent: { snapshot: null, data: [], evidence_ids: [] }, isError: false }) };
  const tracer = new Tracer({ now: () => 0, ids: ids() });
  const traced = await new BoundedAnalysisOrchestrator({ provider: new ScriptedModelProvider(script()), tools, now: () => 0, telemetry: tracer })
    .runReviewed({ investigation, question: 'Explain the transaction for alice@example.org.' });
  const plain = await new BoundedAnalysisOrchestrator({ provider: new ScriptedModelProvider(script()), tools, now: () => 0 })
    .runReviewed({ investigation, question: 'Explain the transaction for alice@example.org.' });
  assert.deepEqual(traced, plain);
  const trace = tracer.export();
  assert.deepEqual(trace.spans.map(span => span.name), ['run', 'analysis', 'analyst.model', 'tool.call', 'tool.call',
    'analyst.model', 'review', 'review.model', 'review.model']);
  const byId = new Map(trace.spans.map(span => [span.span_id, span]));
  assert.ok(trace.spans.every(span => span.trace_id === trace.trace_id));
  assert.equal(trace.spans.filter(span => span.parent_span_id === null).length, 1);
  assert.ok(trace.spans.every(span => span.parent_span_id === null || byId.has(span.parent_span_id)));
  assert.equal(byId.get(trace.spans[3].parent_span_id).name, 'analysis');
  assert.equal(byId.get(trace.spans[7].parent_span_id).name, 'review');
  const root = trace.spans[0].attributes;
  assert.equal(root.report_status, traced.status);
  assert.equal(root.report_id, traced.report_id);
  assert.equal(root.analysis_tool_calls_used, 1);
  assert.equal(root.review_model_calls_used, 2);
  assert.equal(root.review_policy_version, 'evidence-review-policy/1.0.0');
  assert.match(root.question_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(trace.spans.filter(span => span.name === 'tool.call').map(span => [span.attributes.tool, span.attributes.status]),
    [['get_receipt', 'ok'], ['transfer_funds', 'denied']]);
  assert.equal(trace.counters.POLICY_DENIED, 1);
  assert.equal(trace.spans[7].attributes.prompt_version, 'evidence-agent/1.0.0');
  const serialized = JSON.stringify(trace);
  assert.ok(!serialized.includes('alice@example.org') && !serialized.includes('Explain the transaction'));
});

test('failing model call records a redacted error span and counter', async () => {
  const { investigation } = await scenario();
  const provider = new ScriptedModelProvider([() => { throw new Error(SECRET_ERROR); }]);
  const tracer = new Tracer({ now: () => 0, ids: ids() });
  const report = await new BoundedAnalysisOrchestrator({ provider, now: () => 0, telemetry: tracer }).runReviewed({ investigation, question: 'Explain.' });
  assert.ok(report.warnings.includes('MODEL_PROVIDER_ERROR'));
  const trace = tracer.export();
  const failed = trace.spans.find(span => span.name === 'analyst.model');
  assert.equal(failed.status, 'error');
  assert.equal(failed.error.code, 'Error');
  assert.ok(failed.error.message.includes('rpc.example.org'));
  assert.ok(!JSON.stringify(trace).includes('hunter2') && !JSON.stringify(trace).includes('sk-live-123'));
  const errors = trace.spans.filter(span => span.status === 'error');
  assert.ok(errors.length >= 1);
  assert.equal(trace.counters.Error, errors.length);
  assert.equal(trace.spans[0].status, 'ok');
});

test('span limit is enforced and OTLP export is well-formed', async () => {
  const tracer = new Tracer({ now: () => 5, ids: ids() });
  await tracer.span('root', { note: SECRET_ERROR }, async () => {
    for (let i = 0; i < MAX_SPANS + 10; i++) await tracer.span('child', { i }, async () => {});
  });
  const trace = tracer.export();
  assert.equal(trace.spans.length, MAX_SPANS);
  assert.equal(trace.dropped_spans, 11);
  assert.ok(!trace.spans[0].attributes.note.includes('hunter2'));
  const otlp = toOtlpJson(trace);
  const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, MAX_SPANS);
  assert.match(spans[0].traceId, /^[0-9a-f]{32}$/);
  assert.ok(spans.every(span => /^[0-9a-f]{16}$/.test(span.spanId)));
  assert.equal(spans[0].parentSpanId, undefined);
  assert.equal(spans[1].parentSpanId, spans[0].spanId);
  assert.equal(spans[0].startTimeUnixNano, '5000000');
  assert.deepEqual(spans[1].attributes, [{ key: 'i', value: { intValue: '0' } }]);
});

test('run store saves, lists, reads, deletes and sweeps within retention', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bti-runs-'));
  try {
    let clock = 1000;
    const store = new RunStore({ root: dir, profile: 'demo', now: () => clock });
    assert.equal(store.retention_ms, RETENTION_MS.demo);
    assert.equal(new RunStore({ root: dir }).retention_ms, 30 * 24 * 60 * 60 * 1000);
    const investigation = await readInvestigation('fixture', 'synthetic-native-success');
    const saved = [];
    for (let i = 0; i < 2; i++) {
      const tracer = new Tracer();
      const report = await new BoundedAnalysisOrchestrator({ telemetry: tracer }).runReviewed({ investigation, question: 'Summarize.' });
      const trace = tracer.export();
      trace.spans[0].attributes.leak = SECRET_ERROR;
      saved.push(await store.save({ report, trace, source: { kind: 'fixture', fixture_id: 'synthetic-native-success' } }));
      clock += 1000;
    }
    const raw = await readFile(join(dir, saved[0].run_id, 'record.json'), 'utf8');
    assert.ok(!raw.includes('hunter2') && raw.includes('rpc.example.org'));
    assert.equal((await store.get(saved[0].run_id)).report.report_id, saved[0].report.report_id);
    assert.deepEqual((await store.list()).map(run => [run.run_id, run.expired, run.corrupt]).sort(),
      saved.map(run => [run.run_id, false, false]).sort());
    assert.equal(await store.delete(saved[1].run_id), true);
    assert.equal(await store.delete(saved[1].run_id), false);
    assert.equal(await store.get(saved[1].run_id), null);
    const fixtureBefore = (await stat(join(ROOT, 'fixtures', 'synthetic-native-success', 'manifest.json'))).mtimeMs;
    clock = saved[0].expires_at_ms;
    assert.deepEqual(await store.sweep(), [saved[0].run_id]);
    assert.deepEqual(await readdir(dir), []);
    assert.equal((await stat(join(ROOT, 'fixtures', 'synthetic-native-success', 'manifest.json'))).mtimeMs, fixtureBefore);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('run store refuses unsafe roots, malicious ids and invalid retention', async () => {
  for (const root of [ROOT, join(ROOT, 'fixtures'), join(ROOT, 'fixtures', 'x'), join(ROOT, 'corpus', 'runs'), join(ROOT, 'evals'), join(ROOT, '..')]) {
    assert.throws(() => new RunStore({ root }), { code: 'UNSAFE_STORE_ROOT' }, root);
  }
  const dir = await mkdtemp(join(tmpdir(), 'bti-runs-'));
  try {
    const store = new RunStore({ root: dir });
    for (const id of ['../fixtures', '..\\x', 'ABCDEF0123456789ABCDEF0123456789', '0'.repeat(31), `${'0'.repeat(32)}/..`]) {
      await assert.rejects(store.get(id), { code: 'INVALID_RUN_ID' }, id);
      await assert.rejects(store.delete(id), { code: 'INVALID_RUN_ID' }, id);
    }
    assert.throws(() => new RunStore({ root: dir, retention_ms: 1000 }), { code: 'INVALID_RETENTION' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('trace and runs CLIs work offline under the network guard', async () => {
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = (cli, args) => spawnSync(process.execPath, ['--import', guard, join(ROOT, 'dist', cli), ...args], { encoding: 'utf8', timeout: 30000 });
  const otlp = run('trace-cli.js', ['fixture', 'synthetic-reverted', '--otlp']);
  assert.equal(otlp.status, 0, otlp.stderr);
  const spans = JSON.parse(otlp.stdout).resourceSpans[0].scopeSpans[0].spans;
  assert.deepEqual(spans.map(span => span.name), ['run', 'analysis', 'review']);
  const dir = await mkdtemp(join(tmpdir(), 'bti-runs-'));
  try {
    const recorded = run('runs-cli.js', ['record', 'synthetic-reverted', '--store', dir, '--profile', 'demo']);
    assert.equal(recorded.status, 0, recorded.stderr);
    const { run_id: id, report_status: status } = JSON.parse(recorded.stdout);
    assert.equal(status, 'inconclusive');
    assert.equal(JSON.parse(run('runs-cli.js', ['list', '--store', dir]).stdout)[0].run_id, id);
    assert.equal(JSON.parse(run('runs-cli.js', ['get', id, '--store', dir]).stdout).trace.trace_id, id);
    assert.deepEqual(JSON.parse(run('runs-cli.js', ['delete', id, '--store', dir]).stdout), { deleted: true });
    const unsafe = run('runs-cli.js', ['list', '--store', join(ROOT, 'fixtures')]);
    assert.equal(unsafe.status, 1);
    assert.equal(JSON.parse(unsafe.stderr).error.code, 'UNSAFE_STORE_ROOT');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
