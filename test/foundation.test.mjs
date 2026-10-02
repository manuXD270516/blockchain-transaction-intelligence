import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdapterError } from '../dist/adapters/contracts.js';
import { EthereumAdapter } from '../dist/adapters/ethereum.js';
import { LiveTraceBackend, TRACE_METHOD } from '../dist/adapters/tracing.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { identifyContractFixture, loadAbiRegistry, loadContractFixture } from '../dist/contracts/fixture.js';
import { EIP1967_IMPLEMENTATION_SLOT, identifyContract } from '../dist/contracts/identify.js';
import { sha256 } from '../dist/fixtures/loader.js';
import { readFixtureCallTrace, readInvestigation } from '../dist/investigation-input.js';
import { BlockchainMcpService } from '../dist/mcp/service.js';
import { canonical } from '../dist/normalization/evidence.js';
import { loadCorpus } from '../dist/rag/loader.js';
import { manifestIdentity } from '../dist/rag/validation.js';
import { emptyRegistry, readRegistry, registerSnapshot, resolveCitation } from '../dist/rag/versions.js';
import { RunQuota } from '../dist/runs/quota.js';
import { buildCallTrace } from '../dist/traces/calltrace.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const SNAPSHOTS = fileURLToPath(new URL('../corpus/snapshots/', import.meta.url));
const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
const question = 'Summarize only the supported transaction evidence.';

// ---------- reviewed report with call traces ----------
test('reviewed report consumes a call trace while untraced reports stay byte-identical', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const trace = await readFixtureCallTrace('synthetic-token-events', investigation);
  const orchestrator = new BoundedAnalysisOrchestrator({ now: () => 0 });
  const plain = await orchestrator.runReviewed({ investigation, question });
  assert.deepEqual(await orchestrator.runReviewed({ investigation, question, call_trace: null }), plain);
  assert.ok(plain.limitations.includes('Internal calls and revert reasons are unavailable without supported tracing.'));
  const traced = await orchestrator.runReviewed({ investigation, question, call_trace: trace });
  const subcall = traced.validated_facts.find(claim => claim.text.includes('trace_path 0.1 while the receipt reports success'));
  assert.ok(subcall, 'reverted subcall published as a validated fact');
  assert.equal(subcall.classification, 'OBSERVED');
  const frame = trace.frames.find(item => item.trace_path.join('.') === '0.1');
  assert.ok(subcall.evidence_ids.includes(frame.evidence_ids[0]));
  assert.ok(traced.validated_facts.some(claim => claim.text.includes('DELEGATECALL at trace_path 0') && claim.text.includes('not a separate transfer')));
  assert.deepEqual(traced.anomalies.map(item => item.label), ['trace_reports_reverted_subcall']);
  assert.equal(traced.anomalies[0].claim_id, subcall.claim_id);
  assert.ok(traced.claim_evidence.every(item => item.evidence.every(evidence => evidence.kind !== 'unresolved')));
  assert.ok(traced.limitations.some(item => item.startsWith('Internal calls are tracer-reported frames')));
  assert.ok(!traced.validated_facts.some(claim => /fail(?:ed)? transaction|transaction (?:was|is) reverted/i.test(claim.text)));
  assert.notEqual(traced.report_id, plain.report_id);
  assert.equal(traced.replay_manifest.bundle_id, plain.replay_manifest.bundle_id);
});

test('reverted root with a tracer-reported reason yields an OBSERVED reason claim', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-reverted');
  const raw = JSON.parse(await readFile(new URL('../fixtures/call-traces/synthetic-reverted/trace.json', import.meta.url), 'utf8'));
  const text = JSON.stringify({ ...raw, revertReason: 'insufficient allowance' });
  const trace = buildCallTrace(investigation, { schema_version: '1.0.0', provider_id: 'fixture-loader/1.0.0', method: 'fixture:call_trace',
    params: ['0'.repeat(64), '0'.repeat(64)], request_id: 1, captured_at: '2026-10-01T00:00:00.000Z', sha256: sha256(text), raw_utf8: text });
  const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question, call_trace: trace });
  assert.ok(report.validated_facts.some(claim => claim.text === 'The call trace reports revert reason "insufficient allowance" for the transaction.'));
  assert.ok(report.anomalies.some(item => item.label === 'receipt_reports_reverted'));
});

test('a trace from another transaction or with a tampered id is refused before analysis', async () => {
  const reverted = await readInvestigation('fixture', 'synthetic-reverted');
  const tokens = await readInvestigation('fixture', 'synthetic-token-events');
  const trace = await readFixtureCallTrace('synthetic-token-events', tokens);
  const orchestrator = new BoundedAnalysisOrchestrator({ now: () => 0 });
  await assert.rejects(orchestrator.runReviewed({ investigation: reverted, question, call_trace: trace }), { code: 'INCONSISTENT_TRACE' });
  await assert.rejects(orchestrator.runReviewed({ investigation: tokens, question, call_trace: { ...trace, trace_id: '0'.repeat(64) } }),
    { code: 'INCONSISTENT_TRACE' });
});

test('report CLI accepts --with-trace offline', () => {
  const cli = fileURLToPath(new URL('../dist/report-cli.js', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-token-events', '--with-trace'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(JSON.parse(run.stdout).anomalies.some(item => item.label === 'trace_reports_reverted_subcall'));
  const missing = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-pending', '--with-trace'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(JSON.parse(missing.stderr).error.code, 'CALL_TRACE_NOT_AVAILABLE');
});

// ---------- per-identity quotas ----------
test('quota limits runs and concurrency per hashed identity within a fixed window', () => {
  let now = 1000;
  const quota = new RunQuota({ window_ms: 60000, max_runs: 2, max_concurrent: 1, now: () => now });
  const release = quota.acquire('visitor-a');
  assert.throws(() => quota.acquire('visitor-a'), { code: 'RATE_LIMITED', retry_after_ms: 0 });
  release(); release();
  quota.acquire('visitor-a')();
  assert.throws(() => quota.acquire('visitor-a'), error => error.code === 'RATE_LIMITED' && error.retry_after_ms === 60000);
  quota.acquire('visitor-b')();
  assert.ok(quota.keys().every(key => /^[0-9a-f]{64}$/.test(key)));
  assert.ok(!JSON.stringify(quota.keys()).includes('visitor'));
  now += 60000;
  quota.acquire('visitor-a')();
  for (const bad of ['', 'x'.repeat(201), 42]) assert.throws(() => quota.acquire(bad), { code: 'INVALID_INPUT' });
  assert.throws(() => new RunQuota({ window_ms: 0, max_runs: 1, max_concurrent: 1 }), { code: 'INVALID_INPUT' });
});

test('orchestrator rejects an exhausted or anonymous quota before doing any work', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-native-success');
  let toolCalls = 0;
  const tools = { call: async () => { toolCalls++; throw new Error('unexpected'); } };
  const quota = new RunQuota({ window_ms: 60000, max_runs: 1, max_concurrent: 1, now: () => 0 });
  const orchestrator = new BoundedAnalysisOrchestrator({ now: () => 0, quota, tools });
  const first = await orchestrator.runReviewed({ investigation, question, identity: 'visitor' });
  assert.equal(first.status, 'inconclusive');
  await assert.rejects(orchestrator.runReviewed({ investigation, question, identity: 'visitor' }), { code: 'RATE_LIMITED' });
  await assert.rejects(orchestrator.runReviewed({ investigation, question }), { code: 'INVALID_INPUT' });
  assert.equal(toolCalls, 0);
  const unlimited = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question });
  assert.deepEqual(unlimited, first);
});

// ---------- corpus versions ----------
async function derivedSnapshot(dir) {
  // Copies m5-v1 and changes one document's canonical text, rehashing exactly what the build would.
  await cp(join(SNAPSHOTS, 'm5-v1'), join(dir, 'm5-v1'), { recursive: true });
  await cp(join(SNAPSHOTS, 'm5-v1'), join(dir, 'm5-v2'), { recursive: true });
  const root = join(dir, 'm5-v2');
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const entry = manifest.documents.find(item => item.document_id === 'eip-20');
  const document = JSON.parse(await readFile(join(root, entry.file), 'utf8'));
  const oldHash = document.content_hash;
  document.canonical_text += '\n\nSynthetic appended paragraph used to test document versioning.';
  document.content_hash = sha256(document.canonical_text);
  const documentBytes = canonical(document);
  await writeFile(join(root, entry.file), documentBytes);
  Object.assign(entry, { content_hash: document.content_hash, sha256: sha256(documentBytes), bytes: Buffer.byteLength(documentBytes) });
  const chunks = JSON.parse(await readFile(join(root, manifest.chunks.file), 'utf8'));
  for (const chunk of chunks) {
    if (chunk.document_hash !== oldHash) continue;
    chunk.document_hash = document.content_hash;
    chunk.chunk_id = sha256(canonical({ document_hash: chunk.document_hash, heading_path: chunk.heading_path, start: chunk.start,
      end: chunk.end, page: chunk.page, chunk_hash: chunk.chunk_hash }));
  }
  const chunkBytes = canonical(chunks);
  await writeFile(join(root, manifest.chunks.file), chunkBytes);
  Object.assign(manifest.chunks, { sha256: sha256(chunkBytes), bytes: Buffer.byteLength(chunkBytes) });
  manifest.created_at = '2026-10-02T00:00:00.000Z';
  const { corpus_snapshot_id: _id, ...body } = manifest;
  await writeFile(join(root, 'manifest.json'), canonical({ ...body, corpus_snapshot_id: manifestIdentity(body) }));
}

test('corpus registry appends a new document version while old citations keep resolving', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bti-corpus-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await derivedSnapshot(dir);
  const v1 = await loadCorpus(join(dir, 'm5-v1'));
  const v2 = await loadCorpus(join(dir, 'm5-v2'));
  assert.notEqual(v1.manifest.corpus_snapshot_id, v2.manifest.corpus_snapshot_id);
  let registry = registerSnapshot(emptyRegistry(), v1, 'm5-v1');
  registry = registerSnapshot(registry, v2, 'm5-v2');
  assert.equal(registry.snapshots.length, 2);
  assert.deepEqual(registry.snapshots[1].changes.added, []);
  assert.equal(registry.snapshots[1].changes.new_version.length, 1);
  assert.match(registry.snapshots[1].changes.new_version[0], /eip-20\.md$/);
  const oldChunk = v1.chunks.find(chunk => chunk.document_id === 'eip-20');
  const resolved = await resolveCitation(dir, registry, { corpus_snapshot_id: v1.manifest.corpus_snapshot_id, chunk_id: oldChunk.chunk_id });
  assert.equal(resolved.excerpt, oldChunk.excerpt);
  assert.equal(resolved.content_hash, v1.documents.get('eip-20').content_hash);
  await assert.rejects(resolveCitation(dir, registry, { corpus_snapshot_id: v2.manifest.corpus_snapshot_id, chunk_id: oldChunk.chunk_id }),
    { code: 'CITATION_NOT_FOUND' });
  await assert.rejects(resolveCitation(dir, registry, { corpus_snapshot_id: '0'.repeat(64), chunk_id: oldChunk.chunk_id }),
    { code: 'CITATION_SNAPSHOT_NOT_FOUND' });
  assert.throws(() => registerSnapshot(registry, v1, 'm5-v3'), { code: 'SNAPSHOT_ALREADY_REGISTERED' });
  assert.throws(() => registerSnapshot(emptyRegistry(), v1, '../escape'), { code: 'INVALID_SNAPSHOT_PATH' });
  assert.equal(registry.snapshots[0].corpus_snapshot_id, v1.manifest.corpus_snapshot_id, 'earlier versions are never rewritten');
});

test('committed corpus registry lists m5-v1 and resolves its citations', async () => {
  const registry = await readRegistry(SNAPSHOTS);
  assert.deepEqual(registry.snapshots.map(item => item.path), ['m5-v1']);
  const corpus = await loadCorpus(join(SNAPSHOTS, 'm5-v1'));
  const chunk = corpus.chunks[0];
  const resolved = await resolveCitation(SNAPSHOTS, registry, { corpus_snapshot_id: corpus.manifest.corpus_snapshot_id, chunk_id: chunk.chunk_id });
  assert.equal(resolved.excerpt, chunk.excerpt);
});

// ---------- contract identification ----------
test('contract fixtures identify proxies by block and keep unknown identity without historical ABI', async () => {
  const known = await identifyContractFixture(FIXTURES, 'synthetic-proxy-known');
  assert.deepEqual(known.proxy, { kind: 'eip1967', implementation: `0x${'7'.repeat(40)}` });
  assert.equal(known.identity.status, 'identified');
  assert.equal(known.identity.name, 'SyntheticToken');
  assert.equal(known.identity.provenance.source_kind, 'synthetic');
  const upgraded = await identifyContractFixture(FIXTURES, 'synthetic-proxy-upgraded');
  assert.equal(upgraded.address, known.address);
  assert.deepEqual(upgraded.identity, { status: 'unknown', reason: 'NO_HISTORICAL_ABI' });
  assert.ok(upgraded.warnings.includes('CONTRACT_IDENTITY_UNKNOWN'));
  const plain = await identifyContractFixture(FIXTURES, 'synthetic-plain-contract');
  assert.deepEqual([plain.proxy.kind, plain.identity.reason], ['none', 'NO_REGISTERED_CODE']);
  const { state, registry } = await loadContractFixture(FIXTURES, 'synthetic-proxy-known');
  assert.equal(identifyContract({ ...state, implementation_slot: `0x${'1'.repeat(64)}` }, registry).proxy.reason, 'MALFORMED_SLOT');
  assert.deepEqual(identifyContract({ ...state, implementation_slot: null }, registry).identity, { status: 'unknown', reason: 'PROXY_UNRESOLVED' });
  assert.equal(identifyContract({ ...state, code: '0x', implementation_slot: null }, registry).identity.reason, 'NO_CODE');
  assert.deepEqual(identifyContract(state, registry), identifyContract(state, registry));
});

test('contract fixtures and registry are checksum-bound', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bti-contracts-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(FIXTURES, 'contracts'), join(dir, 'contracts'), { recursive: true });
  const state = join(dir, 'contracts', 'synthetic-proxy-known', 'state.json');
  const original = await readFile(state, 'utf8');
  await writeFile(state, original.replace('7777', '7778'));
  await assert.rejects(loadContractFixture(dir, 'synthetic-proxy-known'), { code: 'INTEGRITY_MISMATCH' });
  await writeFile(state, original);
  const registryFile = join(dir, 'contracts', 'abi-registry.json');
  const registry = JSON.parse(await readFile(registryFile, 'utf8'));
  registry.entries[0].name = 'RenamedToken';
  await writeFile(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
  await assert.rejects(loadContractFixture(dir, 'synthetic-proxy-known'), { code: 'INTEGRITY_MISMATCH' });
  registry.entries[0].abi_sha256 = '0'.repeat(64);
  await writeFile(registryFile, JSON.stringify(registry));
  await assert.rejects(loadAbiRegistry(dir), { code: 'INVALID_PAYLOAD' });
  await assert.rejects(loadContractFixture(dir, '../contracts'), { code: 'INVALID_FIXTURE_ID' });
});

const sepolia = JSON.parse(await readFile(new URL('./data/sepolia-synthetic.json', import.meta.url), 'utf8'));
function rpc(overrides = {}) {
  const calls = [];
  const transport = async req => {
    calls.push(structuredClone(req));
    const defaults = { eth_chainId: sepolia.chain_id_hex, eth_getBlockByHash: sepolia.block, eth_getBlockByNumber: sepolia.block, eth_getCode: '0x6000' };
    const value = typeof overrides[req.method] === 'function' ? overrides[req.method](req.params) : overrides[req.method] ?? defaults[req.method];
    return Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: value }));
  };
  return { calls, adapter: new EthereumAdapter(transport, { backoffMs: 0 }) };
}

test('get_contract resolves an EIP-1967 proxy at the pinned block and identifies it only from the registry', async () => {
  const { state, registry } = await loadContractFixture(FIXTURES, 'synthetic-proxy-known');
  const proxyAddress = `0x${'6'.repeat(40)}`;
  const { calls, adapter } = rpc({ eth_getStorageAt: state.implementation_slot,
    eth_getCode: params => params[0] === proxyAddress ? state.code : state.implementation_code });
  const service = new BlockchainMcpService(adapter, new Uint8Array(32).fill(31), () => 'request-31', undefined, undefined, registry);
  const result = (await service.call('get_contract', { chain_id: '11155111', address: proxyAddress, block: { number: '1' } })).structuredContent;
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.data.proxy, { kind: 'eip1967', implementation: `0x${'7'.repeat(40)}` });
  assert.equal(result.data.implementation, `0x${'7'.repeat(40)}`);
  assert.equal(result.data.identity.name, 'SyntheticToken');
  assert.equal(result.data.abi[0].name, 'Transfer');
  assert.ok(!result.coverage.missing.includes('abi'));
  const storage = calls.find(call => call.method === 'eth_getStorageAt');
  assert.deepEqual(storage.params, [proxyAddress, EIP1967_IMPLEMENTATION_SLOT, sepolia.block.number]);
  assert.ok(calls.every(call => !/send|sign|debug|personal|admin/i.test(call.method)));
  // Without a registry the same proxy stays unknown: identity is never inferred from the address.
  const anonymous = new BlockchainMcpService(rpc({ eth_getStorageAt: state.implementation_slot,
    eth_getCode: params => params[0] === proxyAddress ? state.code : state.implementation_code }).adapter, new Uint8Array(32).fill(32), () => 'request-32');
  const unknown = (await anonymous.call('get_contract', { chain_id: '11155111', address: proxyAddress, block: { number: '1' } })).structuredContent;
  assert.deepEqual(unknown.data.identity, { status: 'unknown', reason: 'NO_HISTORICAL_ABI' });
  assert.ok(unknown.warnings.includes('CONTRACT_IDENTITY_NOT_INFERRED'));
});

test('unreadable proxy slot keeps proxy unknown, and other storage slots are denied before the network', async () => {
  const { adapter } = rpc({ eth_getStorageAt: undefined });
  const service = new BlockchainMcpService(adapter, new Uint8Array(32).fill(33), () => 'request-33');
  const result = (await service.call('get_contract', { chain_id: '11155111', address: `0x${'6'.repeat(40)}`, block: { number: '1' } })).structuredContent;
  assert.equal(result.data.proxy.kind, 'unknown');
  assert.ok(result.coverage.missing.includes('proxy_resolution'));
  assert.ok(result.warnings.includes('PROXY_READ_UNAVAILABLE'));
  const { RpcSession } = await import('../dist/adapters/rpc.js');
  let sent = 0;
  const session = new RpcSession(async () => { sent++; return Buffer.from('{}'); }, { backoffMs: 0 });
  await assert.rejects(session.call('eth_getStorageAt', [`0x${'6'.repeat(40)}`, `0x${'0'.repeat(64)}`, '0x1']),
    error => error instanceof AdapterError && error.code === 'POLICY_DENIED');
  await assert.rejects(session.call('eth_getStorageAt', [`0x${'6'.repeat(40)}`, EIP1967_IMPLEMENTATION_SLOT, 'latest']),
    error => error instanceof AdapterError && error.code === 'POLICY_DENIED');
  await assert.rejects(session.call('debug_traceTransaction', [`0x${'1'.repeat(64)}`, { tracer: 'callTracer' }]),
    error => error instanceof AdapterError && error.code === 'POLICY_DENIED');
  assert.equal(sent, 0);
});

test('contract CLI identifies fixtures offline under the network guard', () => {
  const cli = fileURLToPath(new URL('../dist/contract-cli.js', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-proxy-upgraded'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).identity.reason, 'NO_HISTORICAL_ABI');
});

// ---------- live tracing: configuration only ----------
const enabledConfig = { schema_version: '1.0.0', enabled: true, provider_id: 'test-tracer', chain_id: '11155111',
  endpoint_host: 'tracer.example.invalid', timeout_ms: 1000 };

test('live tracing stays disabled without explicit configuration and validates its config', async () => {
  const example = JSON.parse(await readFile(new URL('../config/live-tracing.example.json', import.meta.url), 'utf8'));
  let sent = 0;
  const transport = async () => { sent++; return Buffer.from('{}'); };
  for (const config of [undefined, null, example, { ...enabledConfig, enabled: false }]) {
    assert.throws(() => LiveTraceBackend.create(config, transport), { code: 'LIVE_TRACING_DISABLED' });
  }
  for (const endpoint_host of ['https://tracer.example', 'user:pass@tracer.example', 'tracer.example/path?key=1', '127.0.0.1']) {
    assert.throws(() => LiveTraceBackend.create({ ...enabledConfig, endpoint_host }, transport), { code: 'INVALID_INPUT' });
  }
  assert.throws(() => LiveTraceBackend.create({ ...enabledConfig, timeout_ms: 60000 }, transport), { code: 'INVALID_INPUT' });
  assert.throws(() => LiveTraceBackend.create({ ...enabledConfig, api_key: 'x' }, transport), { code: 'INVALID_INPUT' });
  assert.equal(sent, 0);
});

test('enabled live tracing sends only the fixed callTracer request and feeds buildCallTrace', async () => {
  const investigation = await readInvestigation('fixture', 'synthetic-token-events');
  const rawTrace = JSON.parse(await readFile(new URL('../fixtures/call-traces/synthetic-token-events/trace.json', import.meta.url), 'utf8'));
  const requests = [];
  const backend = LiveTraceBackend.create(enabledConfig, async request => {
    requests.push(structuredClone(request));
    return Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: rawTrace }));
  });
  const evidence = await backend.traceTransaction(investigation.raw.transaction.hash);
  assert.deepEqual(requests, [{ jsonrpc: '2.0', id: 1, method: TRACE_METHOD, params: [investigation.raw.transaction.hash, { tracer: 'callTracer' }] }]);
  assert.equal(evidence.provider_id, 'test-tracer');
  assert.deepEqual(buildCallTrace(investigation, evidence).reverted_subcalls, ['0.1']);
  const unsupported = LiveTraceBackend.create(enabledConfig, async request =>
    Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'the method debug_traceTransaction does not exist' } })));
  await assert.rejects(unsupported.traceTransaction(investigation.raw.transaction.hash), { code: 'UNSUPPORTED_CAPABILITY' });
  await assert.rejects(backend.traceTransaction('0x1234'), { code: 'INVALID_INPUT' });
  const huge = LiveTraceBackend.create(enabledConfig, async () => Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(huge.traceTransaction(investigation.raw.transaction.hash), { code: 'SIZE_LIMIT' });
});
