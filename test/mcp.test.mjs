import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AdapterError } from '../dist/adapters/contracts.js';
import { EthereumAdapter } from '../dist/adapters/ethereum.js';
import { BlockchainMcpService, PUBLIC_ERROR_CODES, TOOL_NAMES } from '../dist/mcp/service.js';
import { CursorCodec } from '../dist/mcp/cursor.js';
import { buildMcpServer } from '../dist/mcp/server.js';

const fixture = JSON.parse(await readFile(new URL('./data/sepolia-synthetic.json', import.meta.url), 'utf8'));
const encode = value => Buffer.from(JSON.stringify(value));
function backend(overrides = {}) {
  const calls = [];
  const transport = async req => {
    calls.push(structuredClone(req));
    const defaults = { eth_chainId: fixture.chain_id_hex, eth_getTransactionByHash: fixture.transaction,
      eth_getTransactionReceipt: fixture.receipt, eth_getBlockByHash: fixture.block, eth_getBlockByNumber: fixture.block,
      eth_getBalance: '0x0', eth_getCode: '0x6000', eth_getLogs: [] };
    const value = Object.hasOwn(overrides, req.method) ? overrides[req.method] : defaults[req.method];
    return encode({ jsonrpc: '2.0', id: req.id, result: structuredClone(value) });
  };
  return { calls, value: new EthereumAdapter(transport, { backoffMs: 0 }) };
}
async function connected(service) {
  const server = buildMcpServer(service);
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test('MCP protocol exposes exactly nine closed read-only tools', async t => {
  const { client, server } = await connected(new BlockchainMcpService(backend().value, new Uint8Array(32).fill(1), () => 'request-1'));
  t.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [...TOOL_NAMES].sort());
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true,
      openWorldHint: tool.name !== 'search_protocol_docs' });
  }
});

test('tools/call returns canonical transaction with evidence and no endpoint', async t => {
  const provider = backend();
  const { client, server } = await connected(new BlockchainMcpService(provider.value, new Uint8Array(32).fill(2), () => 'request-2'));
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: 'get_transaction', arguments: { chain_id: '11155111', tx_hash: fixture.transaction.hash } });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.request_id, 'request-2');
  assert.equal(result.structuredContent.data.fields.hash, fixture.transaction.hash);
  assert.ok(result.structuredContent.evidence_ids.length > 0);
  assert.equal(JSON.stringify(result).includes('ethereum-sepolia-rpc.publicnode.com'), false);
  assert.ok(provider.calls.every(call => !/send|sign|personal|admin|debug/i.test(call.method)));
});

test('future tools abstain with unavailable instead of fabricating results', async t => {
  const { client, server } = await connected(new BlockchainMcpService(backend().value, new Uint8Array(32).fill(3), () => 'request-3'));
  t.after(async () => { await client.close(); await server.close(); });
  const trace = await client.callTool({ name: 'trace_transaction', arguments: { chain_id: '11155111', tx_hash: fixture.transaction.hash } });
  assert.equal(trace.structuredContent.status, 'unavailable');
  assert.deepEqual(trace.structuredContent.warnings, ['UNSUPPORTED_CAPABILITY']);
  const docs = await client.callTool({ name: 'search_protocol_docs', arguments: { query: 'ERC-20 Transfer' } });
  assert.equal(docs.structuredContent.status, 'unavailable');
  assert.deepEqual(docs.structuredContent.warnings, ['CORPUS_NOT_CONFIGURED']);
});

test('implemented handlers return valid envelopes through tools/call', async t => {
  const { client, server } = await connected(new BlockchainMcpService(backend().value, new Uint8Array(32).fill(8), () => 'request-8'));
  t.after(async () => { await client.close(); await server.close(); });
  const calls = [
    ['get_receipt', { chain_id: '11155111', tx_hash: fixture.transaction.hash }],
    ['get_block', { chain_id: '11155111', block: { number: '1' } }],
    ['get_wallet_balance', { chain_id: '11155111', address: fixture.transaction.to, block: { number: '1' } }],
    ['get_token_transfers', { chain_id: '11155111', tx_hash: fixture.transaction.hash }],
    ['get_contract', { chain_id: '11155111', address: fixture.transaction.to, block: { number: '1' } }],
    ['get_contract_events', { chain_id: '11155111', address: fixture.transaction.to, from_block: '1', to_block: '1' }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, name);
    assert.equal(result.structuredContent.schema_version, '1.0.0', name);
    assert.equal(result.structuredContent.request_id, 'request-8', name);
    assert.ok(['ok', 'partial', 'not_found', 'unavailable'].includes(result.structuredContent.status), name);
    assert.ok(Array.isArray(result.structuredContent.evidence_ids), name);
    assert.equal(typeof result.structuredContent.coverage.complete, 'boolean', name);
  }
});

test('schema and dispatcher reject authority expansion before RPC', async t => {
  const provider = backend();
  const service = new BlockchainMcpService(provider.value, new Uint8Array(32).fill(4), () => 'request-4');
  const { client, server } = await connected(service);
  t.after(async () => { await client.close(); await server.close(); });
  const schemaRejected = await client.callTool({ name: 'get_block', arguments: { chain_id: '11155111', block: { tag: 'pending' } } });
  assert.equal(schemaRejected.isError, true);
  const wrongChain = await service.call('get_block', { chain_id: '1', block: { tag: 'latest' } });
  assert.equal(wrongChain.isError, true);
  assert.equal(wrongChain.structuredContent.error.code, 'UNSUPPORTED_CHAIN');
  const extra = await service.call('get_transaction', { chain_id: '11155111', tx_hash: fixture.transaction.hash, rpc_method: 'eth_sendRawTransaction' });
  assert.equal(extra.structuredContent.error.code, 'INVALID_INPUT');
  const invalidDocs = await service.call('search_protocol_docs', { query: 'x', top_k: 11 });
  assert.equal(invalidDocs.structuredContent.error.code, 'INVALID_INPUT');
  const wrongDocsChain = await service.call('search_protocol_docs', { query: 'x', chain_id: '1' });
  assert.equal(wrongDocsChain.structuredContent.error.code, 'UNSUPPORTED_CHAIN');
  assert.equal(provider.calls.length, 0);
});

test('contract event pagination is ordered and cursor stays query-bound', async () => {
  const log = index => ({ address: fixture.transaction.to, blockHash: fixture.block.hash, blockNumber: '0x1',
    transactionHash: fixture.transaction.hash, transactionIndex: '0x0', logIndex: `0x${index.toString(16)}`,
    data: '0x', topics: [], removed: false });
  const service = new BlockchainMcpService(backend({ eth_getLogs: [log(1), log(0)] }).value, new Uint8Array(32).fill(5), () => 'request-5');
  const first = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '1', limit: 1 });
  assert.equal(first.structuredContent.data[0].raw.logIndex, '0x0');
  assert.equal(first.structuredContent.data[0].decoded.status, 'unknown');
  assert.equal(first.structuredContent.coverage.truncated, true);
  assert.match(first.structuredContent.coverage.snapshot_manifest_hash, /^[0-9a-f]{64}$/);
  const cursor = first.structuredContent.page.next_cursor;
  const second = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '1', limit: 1, cursor });
  assert.equal(second.structuredContent.data[0].raw.logIndex, '0x1');
  assert.equal(second.structuredContent.coverage.snapshot_manifest_hash, first.structuredContent.coverage.snapshot_manifest_hash);
  const rebound = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '1', topics: [`0x${'f'.repeat(64)}`], limit: 1, cursor });
  assert.equal(rebound.structuredContent.error.code, 'INVALID_CURSOR');
});

test('cursor is authenticated, query-bound and expires', () => {
  let now = 1000;
  const codec = new CursorCodec(new Uint8Array(32).fill(9), () => now);
  const cursor = codec.encode('get_contract_events', 'query-a', 50, 100);
  assert.equal(codec.decode(cursor, 'get_contract_events', 'query-a'), 50);
  assert.throws(() => codec.decode(`${cursor.slice(0, -1)}x`, 'get_contract_events', 'query-a'));
  assert.throws(() => codec.decode(cursor, 'get_token_transfers', 'query-a'));
  assert.throws(() => codec.decode(cursor, 'get_contract_events', 'query-b'));
  now = 1101;
  assert.throws(() => codec.decode(cursor, 'get_contract_events', 'query-a'));
});

test('cursor rejects a changed block snapshot on the next events page', async () => {
  let blockHash = fixture.block.hash;
  const log = index => ({ address: fixture.transaction.to, blockHash, blockNumber: '0x1',
    transactionHash: fixture.transaction.hash, transactionIndex: '0x0', logIndex: `0x${index.toString(16)}`,
    data: '0x', topics: [], removed: false });
  const snapshotBackend = {
    investigate: async () => { throw new Error('unused'); },
    getBlock: async () => { throw new Error('unused'); },
    getBalance: async () => { throw new Error('unused'); },
    getCode: async () => { throw new Error('unused'); },
    getLogs: async () => ({ schema_version: '1.0.0', data: [log(0), log(1)],
      snapshot: { chain_id: '11155111', block_hash: blockHash, block_number: '1', finality: 'unknown' },
      evidence: [], attempts: [] }),
  };
  const service = new BlockchainMcpService(snapshotBackend, new Uint8Array(32).fill(6), () => 'request-6');
  const first = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '1', limit: 1 });
  blockHash = `0x${'b'.repeat(64)}`;
  const second = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '1', limit: 1, cursor: first.structuredContent.page.next_cursor });
  assert.equal(second.structuredContent.error.code, 'INVALID_CURSOR');
});

test('range, page and response budgets fail closed before leaking content', async () => {
  const provider = backend();
  const service = new BlockchainMcpService(provider.value, new Uint8Array(32).fill(7), () => 'request-7');
  const range = await service.call('get_contract_events', { chain_id: '11155111', address: fixture.transaction.to,
    from_block: '1', to_block: '101' });
  assert.equal(range.structuredContent.error.code, 'INVALID_INPUT');
  const page = await service.call('get_token_transfers', { chain_id: '11155111', tx_hash: fixture.transaction.hash, limit: 101 });
  assert.equal(page.structuredContent.error.code, 'INVALID_INPUT');
  assert.equal(provider.calls.length, 0);

  provider.value.getCode = async () => ({ schema_version: '1.0.0', data: `0x${'00'.repeat(1024 * 1024)}`,
    snapshot: { chain_id: '11155111', block_hash: fixture.block.hash, block_number: '1', finality: 'unknown' },
    evidence: [], attempts: [] });
  const oversized = await service.call('get_contract', { chain_id: '11155111', address: fixture.transaction.to, block: { number: '1' } });
  assert.equal(oversized.structuredContent.error.code, 'BUDGET_EXCEEDED');
  assert.equal(JSON.stringify(oversized).includes('00000000000000000000000000000000'), false);
});

test('operational errors are stable and do not reflect provider details', async () => {
  const provider = backend().value;
  provider.investigate = async () => { throw new Error(`secret-provider-message:${fixture.transaction.hash}`); };
  const service = new BlockchainMcpService(provider, new Uint8Array(32).fill(10), () => 'request-10');
  const failed = await service.call('get_transaction', { chain_id: '11155111', tx_hash: fixture.transaction.hash });
  assert.equal(failed.isError, true);
  assert.ok(PUBLIC_ERROR_CODES.includes(failed.structuredContent.error.code));
  assert.equal(JSON.stringify(failed).includes('secret-provider-message'), false);
  assert.equal(JSON.stringify(failed).includes(fixture.transaction.hash), false);

  provider.getBalance = async () => { throw new AdapterError('PRUNED_STATE'); };
  const pruned = await service.call('get_wallet_balance', { chain_id: '11155111', address: fixture.transaction.to, block: { number: '1' } });
  assert.equal(pruned.isError, undefined);
  assert.equal(pruned.structuredContent.status, 'unavailable');
  assert.deepEqual(pruned.structuredContent.warnings, ['PRUNED_STATE']);
});

test('compiled stdio entrypoint negotiates the modern MCP era under an offline guard', { timeout: 15000 }, async () => {
  const cli = fileURLToPath(new URL('../dist/mcp-cli.js', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const denied = spawnSync(process.execPath, ['--import', guard, '--input-type=module', '-e',
    'const https = await import("node:https"); https.get("https://example.invalid")'], { encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /OFFLINE_POLICY_DENIED/);
  const client = new Client({ name: 'stdio-contract-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', guard, cli], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  try {
    try { await client.connect(transport); } catch (error) {
      throw new Error(`stdio failed: ${error instanceof Error ? error.message : String(error)}; stderr=${stderr}`);
    }
    assert.equal(client.getProtocolEra(), 'modern');
    assert.equal((await client.listTools()).tools.length, 9);
    const result = await client.callTool({ name: 'trace_transaction',
      arguments: { chain_id: '11155111', tx_hash: fixture.transaction.hash } });
    assert.equal(result.structuredContent.status, 'unavailable');
    assert.deepEqual(result.structuredContent.warnings, ['UNSUPPORTED_CAPABILITY']);
  } finally { await client.close(); }
});
