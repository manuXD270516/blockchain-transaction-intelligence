import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { EthereumAdapter } from '../dist/adapters/ethereum.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { extractTokenEvents } from '../dist/events/extract.js';
import { sha256 } from '../dist/fixtures/loader.js';
import { renderGraphHtml } from '../dist/graph/render.js';
import { buildGraphView } from '../dist/graph/view.js';
import { readFixtureCallTrace, readInvestigation } from '../dist/investigation-input.js';
import { buildMcpServer } from '../dist/mcp/server.js';
import { BlockchainMcpService } from '../dist/mcp/service.js';
import { buildCallTrace, TraceError } from '../dist/traces/calltrace.js';
import { loadCallTraceFixture } from '../dist/traces/fixture.js';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
const rawTrace = async id => JSON.parse(await readFile(new URL(`../fixtures/call-traces/${id}/trace.json`, import.meta.url), 'utf8'));
function evidenceFor(value, text = JSON.stringify(value)) {
  return { schema_version: '1.0.0', provider_id: 'fixture-loader/1.0.0', method: 'fixture:call_trace',
    params: ['0'.repeat(64), '0'.repeat(64)], request_id: 1, captured_at: '2026-10-01T00:00:00.000Z', sha256: sha256(text), raw_utf8: text };
}
const rejects = (fn, code) => assert.throws(fn, error => error instanceof TraceError && error.code === code);
const byPath = (trace, path) => trace.frames.find(frame => frame.trace_path.join('.') === path);

test('successful transaction keeps reverted subcalls, ancestor attempts and delegatecall semantics apart', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const trace = await readFixtureCallTrace('synthetic-token-events', investigation);
  assert.equal(trace.transaction_status, 'success');
  assert.deepEqual(trace.reverted_subcalls, ['0.1']);
  assert.deepEqual(trace.frames.map(frame => frame.trace_path.join('.')), ['', '0', '0.0', '0.1', '0.1.0', '0.2']);
  assert.ok(trace.warnings.includes('SUBCALL_REVERTED_TRANSACTION_SUCCEEDED'));
  assert.ok(trace.warnings.includes('DELEGATECALL_VALUE_IS_NOT_A_TRANSFER'));
  assert.ok(trace.warnings.includes('SYNTHETIC_DATA_NOT_A_PUBLIC_TRANSACTION'));
  assert.equal(trace.coverage.status, 'complete');
  const rootFrame = byPath(trace, '');
  assert.equal(rootFrame.status, 'executed');
  assert.equal(rootFrame.native_value_effective_wei, '1000000000000000000');
  const delegate = byPath(trace, '0');
  assert.equal(delegate.call_type, 'DELEGATECALL');
  assert.equal(delegate.context_address, `0x${'c'.repeat(40)}`);
  assert.equal(delegate.code_address, `0x${'5'.repeat(40)}`);
  assert.equal(delegate.value_declared_wei, '1000000000000000000');
  assert.equal(delegate.value_semantics, 'not_a_transfer');
  assert.equal(delegate.native_value_effective_wei, null);
  const failed = byPath(trace, '0.1');
  assert.deepEqual([failed.own_reverted, failed.ancestor_reverted, failed.status, failed.value_semantics], [true, false, 'reverted', 'reverted_attempt']);
  assert.equal(failed.native_value_effective_wei, null);
  assert.equal(failed.error_observed, 'execution reverted');
  assert.equal(failed.revert_reason, null);
  const nested = byPath(trace, '0.1.0');
  assert.deepEqual([nested.own_reverted, nested.ancestor_reverted, nested.status, nested.value_semantics], [false, true, 'reverted', 'reverted_attempt']);
  assert.equal(nested.native_value_effective_wei, null);
  assert.equal(byPath(trace, '0.2').value_semantics, 'not_a_transfer');
  assert.equal(byPath(trace, '0.0').native_value_effective_wei, '0');
  // Evidence: one raw node plus one derived node per frame, parented to the raw trace and the normalized transaction.
  const [raw, ...derived] = trace.evidence;
  assert.equal(raw.kind, 'fixture_materialized');
  assert.equal(raw.source.method, 'fixture:call_trace');
  assert.equal(derived.length, trace.frames.length);
  for (const frame of trace.frames) {
    const node = trace.evidence.find(item => item.evidence_id === frame.evidence_ids[0]);
    assert.ok(node && node.transformation === 'call-trace/1.0.0' && node.parent_evidence_ids[0] === raw.evidence_id);
    const { evidence_ids: _ids, ...record } = frame;
    assert.deepEqual(node.value, record);
  }
  assert.equal(derived.find(node => node.value.trace_path.join('.') === '0.1.0').field_sources.frame[0], '/calls/0/calls/1/calls/0');
  assert.ok(Object.isFrozen(trace) && Object.isFrozen(trace.frames[0]));
  assert.deepEqual(await readFixtureCallTrace('synthetic-token-events', investigation), trace);
});

test('reverted root without reason keeps the cause unknown and nested calls as attempts', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-reverted');
  const trace = await readFixtureCallTrace('synthetic-reverted', investigation);
  assert.equal(trace.transaction_status, 'reverted');
  assert.ok(trace.warnings.includes('REVERT_REASON_UNKNOWN'));
  assert.ok(!trace.warnings.includes('SUBCALL_REVERTED_TRANSACTION_SUCCEEDED'));
  assert.equal(trace.frames[0].revert_reason, null);
  assert.ok(trace.frames.every(frame => frame.status === 'reverted' && frame.native_value_effective_wei === null));
  assert.equal(trace.frames[1].ancestor_reverted, true);
  const withReason = { ...(await rawTrace('synthetic-reverted')), revertReason: 'insufficient allowance' };
  const reasoned = buildCallTrace(investigation, evidenceFor(withReason));
  assert.equal(reasoned.frames[0].revert_reason, 'insufficient allowance');
  assert.ok(!reasoned.warnings.includes('REVERT_REASON_UNKNOWN'));
});

test('traces require a receipt and fixtures without a trace stay unavailable', async () => {
  const pending = await readInvestigation('fixture', 'synthetic-pending');
  const source = evidenceFor(await rawTrace('synthetic-token-events'));
  rejects(() => buildCallTrace(pending, source), 'TRACE_REQUIRES_RECEIPT');
  assert.equal(await readFixtureCallTrace('synthetic-native-success', await readInvestigation('fixture', 'synthetic-native-success')), null);
  await assert.rejects(loadCallTraceFixture(root, '../synthetic-token-events'), { code: 'INVALID_FIXTURE_ID' });
});

test('frame and depth limits truncate with explicit partial coverage', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const source = evidenceFor(await rawTrace('synthetic-token-events'));
  const byFrames = buildCallTrace(investigation, source, { frames: 3, depth: 64 });
  assert.equal(byFrames.coverage.status, 'partial');
  assert.deepEqual([byFrames.coverage.total_frames, byFrames.coverage.kept_frames, byFrames.coverage.omitted_frames], [6, 3, 3]);
  assert.ok(byFrames.coverage.truncated && byFrames.warnings.includes('TRACE_TRUNCATED'));
  assert.deepEqual(byFrames.frames.map(frame => frame.trace_path.join('.')), ['', '0', '0.0']);
  const byDepth = buildCallTrace(investigation, source, { frames: 1000, depth: 1 });
  assert.deepEqual(byDepth.frames.map(frame => frame.trace_path.join('.')), ['', '0']);
  assert.equal(byDepth.coverage.depth_exceeded, true);
  assert.equal(byDepth.coverage.omitted_frames, 4);
  rejects(() => buildCallTrace(investigation, source, { frames: 0, depth: 1 }), 'INVALID_TRACE');
  rejects(() => buildCallTrace(investigation, source, { frames: 5000, depth: 1 }), 'INVALID_TRACE');
});

test('root frames incoherent with the transaction or receipt are rejected', async () => {
  const success = await readInvestigation('fixture', 'synthetic-token-events');
  const reverted = await readInvestigation('fixture', 'synthetic-reverted');
  const base = await rawTrace('synthetic-token-events');
  for (const change of [{ from: `0x${'1'.repeat(40)}` }, { to: `0x${'1'.repeat(40)}` }, { value: '0x1' }, { input: '0xabcdef01' },
    { error: 'execution reverted' }]) {
    rejects(() => buildCallTrace(success, evidenceFor({ ...base, ...change })), 'INCONSISTENT_TRACE');
  }
  const { error: _error, ...withoutError } = await rawTrace('synthetic-reverted');
  rejects(() => buildCallTrace(reverted, evidenceFor(withoutError)), 'INCONSISTENT_TRACE');
  // A trace bound to another transaction is refused before normalization.
  await assert.rejects(readFixtureCallTrace('synthetic-token-events', reverted), { code: 'INCONSISTENT_TRACE' });
});

test('unknown schema, malformed fields, tampered evidence and oversize traces are refused', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const base = await rawTrace('synthetic-token-events');
  const child = change => ({ ...base, calls: [{ ...base.calls[0], ...change }] });
  for (const bad of [{ ...base, extra: true }, child({ type: 'JUMP' }), child({ from: 'not-an-address' }), child({ value: '0x01' }),
    child({ revertReason: 'reason without error' }), child({ calls: {} }), child({ error: '' }), child({ input: undefined })]) {
    rejects(() => buildCallTrace(investigation, evidenceFor(JSON.parse(JSON.stringify(bad)))), 'INVALID_TRACE');
  }
  rejects(() => buildCallTrace(investigation, { ...evidenceFor(base), sha256: '0'.repeat(64) }), 'INVALID_TRACE');
  rejects(() => buildCallTrace(investigation, evidenceFor(null, 'not json')), 'INVALID_TRACE');
  rejects(() => buildCallTrace(investigation, evidenceFor(null, ' '.repeat(2 * 1024 * 1024 + 1))), 'SIZE_LIMIT');
});

test('trace fixture loader verifies checksums and manifest bindings', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'bti-trace-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const target = join(temp, 'call-traces', 'synthetic-token-events');
  await cp(join(root, 'call-traces', 'synthetic-token-events'), target, { recursive: true });
  const loaded = await loadCallTraceFixture(temp, 'synthetic-token-events');
  assert.equal(loaded.manifest.tracer, 'callTracer');
  assert.equal(loaded.evidence.sha256, sha256(loaded.evidence.raw_utf8));
  const file = join(target, 'trace.json');
  const original = await readFile(file, 'utf8');
  await writeFile(file, original.replace('execution reverted', 'execution REVERTED'));
  await assert.rejects(loadCallTraceFixture(temp, 'synthetic-token-events'), { code: 'INTEGRITY_MISMATCH' });
  await writeFile(file, original);
  const manifestFile = join(target, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  await writeFile(manifestFile, JSON.stringify({ ...manifest, tracer: 'prestateTracer' }));
  await assert.rejects(loadCallTraceFixture(temp, 'synthetic-token-events'), { code: 'INVALID_MANIFEST' });
  await writeFile(manifestFile, JSON.stringify({ ...manifest, snapshot: { ...manifest.snapshot, tx_hash: `0x${'9'.repeat(64)}` } }));
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  await assert.rejects(readFixtureCallTrace('synthetic-token-events', investigation, temp), { code: 'INCONSISTENT_TRACE' });
});

async function graph(fixture, trace) {
  const investigation = await readInvestigation('fixture', fixture);
  const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize.' });
  return buildGraphView(extractTokenEvents(investigation), report, 200, trace);
}

test('graph shows traced internal calls with evidence and leaves untraced views unchanged', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const trace = await readFixtureCallTrace('synthetic-token-events', investigation);
  const traced = await graph('synthetic-token-events', trace);
  assert.equal(traced.call_trace_available, true);
  assert.equal(traced.call_trace.trace_id, trace.trace_id);
  const calls = traced.edges.filter(edge => edge.kind === 'internal_call');
  assert.deepEqual(calls.map(edge => edge.status), ['executed', 'executed', 'reverted', 'reverted', 'executed']);
  assert.equal(traced.edges[0].kind, 'transaction_declared');
  assert.equal(traced.edges[0].status, 'executed');
  assert.ok(calls.every(edge => edge.evidence.length === 1 && edge.evidence[0].transformation === 'call-trace/1.0.0'));
  assert.ok(calls[0].label.includes('is not a transfer') && calls[0].label.includes(`code 0x${'5'.repeat(40)}`));
  const roles = Object.fromEntries(traced.nodes.map(node => [node.label, node.roles]));
  assert.ok(roles[`0x${'c'.repeat(40)}`].includes('delegatecall-context'));
  assert.ok(roles[`0x${'5'.repeat(40)}`].includes('delegatecall-code'));
  assert.ok(traced.notices.some(notice => notice.startsWith('CALL_TRACE')));
  assert.ok(traced.notices.some(notice => notice.startsWith('SUBCALL_REVERTED') && notice.includes('0.1')));
  assert.ok(!traced.notices.some(notice => notice.startsWith('NO_CALL_TRACE')));
  const untraced = await graph('synthetic-token-events', null);
  assert.equal(untraced.call_trace_available, false);
  assert.equal(Object.hasOwn(untraced, 'call_trace'), false);
  assert.deepEqual(untraced, await graph('synthetic-token-events'));
  assert.ok(!untraced.edges.some(edge => edge.kind === 'internal_call'));
  const reverted = await graph('synthetic-reverted', await readFixtureCallTrace('synthetic-reverted', await readInvestigation('fixture', 'synthetic-reverted')));
  assert.ok(reverted.notices.some(notice => notice.includes('no revert reason, so the cause is unknown')));
  await assert.rejects(graph('synthetic-reverted', trace), { code: 'INCONSISTENT_TRACE' });
});

test('tracer-reported error text renders as inert text', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const base = await rawTrace('synthetic-token-events');
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const tampered = structuredClone(base);
  tampered.calls[0].calls[1].error = hostile;
  const view = await graph('synthetic-token-events', buildCallTrace(investigation, evidenceFor(tampered)));
  const html = renderGraphHtml(view);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/<script/i.test(html) && !/<img/i.test(html));
  assert.ok(html.includes('punteada = llamada interna'));
});

const sepolia = JSON.parse(await readFile(new URL('./data/sepolia-synthetic.json', import.meta.url), 'utf8'));
function tracedBackend(traceValue) {
  const transport = async req => {
    const results = { eth_chainId: sepolia.chain_id_hex, eth_getTransactionByHash: sepolia.transaction, eth_getTransactionReceipt: sepolia.receipt,
      eth_getBlockByHash: sepolia.block, eth_getBlockByNumber: sepolia.block };
    return Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: structuredClone(results[req.method]) }));
  };
  const adapter = new EthereumAdapter(transport, { backoffMs: 0 });
  return { investigate: hash => adapter.investigate(hash), getBlock: ref => adapter.getBlock(ref), getBalance: (a, r) => adapter.getBalance(a, r),
    getCode: (a, r) => adapter.getCode(a, r), getLogs: (a, r) => adapter.getLogs(a, r),
    traceTransaction: async () => ({ ...evidenceFor(traceValue), provider_id: 'test-tracer', method: 'debug_traceTransaction' }) };
}
const sepoliaTrace = { type: 'CALL', from: sepolia.transaction.from, to: sepolia.transaction.to, value: sepolia.transaction.value, gas: '0x5208',
  gasUsed: '0x5208', input: sepolia.transaction.input, calls: [
    { type: 'CALL', from: sepolia.transaction.to, to: `0x${'6'.repeat(40)}`, value: '0x1', gas: '0x100', gasUsed: '0x100', input: '0x', error: 'execution reverted' },
    { type: 'STATICCALL', from: sepolia.transaction.to, to: `0x${'7'.repeat(40)}`, gas: '0x100', gasUsed: '0x10', input: '0x' }] };
const args = { chain_id: '11155111', tx_hash: sepolia.transaction.hash };

test('trace_transaction returns frames from a tracing backend and partial coverage when truncated', async t => {
  const server = buildMcpServer(new BlockchainMcpService(tracedBackend(sepoliaTrace), new Uint8Array(32).fill(21), () => 'request-21'));
  const client = new Client({ name: 'trace-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: 'trace_transaction', arguments: args });
  const body = result.structuredContent;
  assert.equal(result.isError, undefined);
  assert.equal(body.status, 'ok');
  assert.equal(body.data.transaction_status, 'success');
  assert.deepEqual(body.data.reverted_subcalls, ['0']);
  assert.equal(body.data.frames.length, 3);
  assert.ok(body.warnings.includes('SUBCALL_REVERTED_TRANSACTION_SUCCEEDED'));
  assert.deepEqual([body.coverage.complete, body.coverage.truncated], [true, false]);
  assert.ok(body.data.frames.every(frame => frame.evidence_ids.every(id => body.evidence_ids.includes(id))));

  const limited = new BlockchainMcpService(tracedBackend(sepoliaTrace), new Uint8Array(32).fill(22), () => 'request-22', undefined,
    { frames: 2, depth: 64 });
  const partial = (await limited.call('trace_transaction', args)).structuredContent;
  assert.equal(partial.status, 'partial');
  assert.deepEqual([partial.coverage.complete, partial.coverage.truncated, partial.coverage.omitted_frames], [false, true, 1]);
  assert.deepEqual(partial.coverage.missing, ['frames_beyond_limit']);
  assert.ok(partial.warnings.includes('TRACE_TRUNCATED'));

  const inconsistent = new BlockchainMcpService(tracedBackend({ ...sepoliaTrace, value: '0x0' }), new Uint8Array(32).fill(23), () => 'request-23');
  const refused = await inconsistent.call('trace_transaction', args);
  assert.equal(refused.isError, true);
  assert.equal(refused.structuredContent.error.code, 'INCONSISTENT_SNAPSHOT');
});

test('call-trace and graph CLIs stay offline under the network guard', () => {
  const calltrace = fileURLToPath(new URL('../dist/calltrace-cli.js', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', guard, calltrace, 'fixture', 'synthetic-token-events'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).reverted_subcalls, ['0.1']);
  const missing = spawnSync(process.execPath, ['--import', guard, calltrace, 'fixture', 'synthetic-native-success'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).error.code, 'CALL_TRACE_NOT_AVAILABLE');
  const graphCli = fileURLToPath(new URL('../dist/graph-cli.js', import.meta.url));
  const html = spawnSync(process.execPath, ['--import', guard, graphCli, 'fixture', 'synthetic-token-events', '--with-trace'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(html.status, 0, html.stderr);
  assert.ok(html.stdout.includes('internal_call'));
  const json = spawnSync(process.execPath, ['--import', guard, graphCli, 'fixture', 'synthetic-reverted', '--json', '--with-trace'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(JSON.parse(json.stdout).call_trace_available, true);
  const bad = spawnSync(process.execPath, ['--import', guard, graphCli, 'fixture', 'synthetic-pending', '--with-trace'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(JSON.parse(bad.stderr).error.code, 'CALL_TRACE_NOT_AVAILABLE');
});
