import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EthereumAdapter } from '../dist/adapters/ethereum.js';
import { FixtureAdapter } from '../dist/adapters/fixture.js';
import { RpcSession, publicIPv4 } from '../dist/adapters/rpc.js';
import { AdapterError } from '../dist/adapters/contracts.js';

const fixture = JSON.parse(await readFile(new URL('./data/sepolia-synthetic.json', import.meta.url), 'utf8'));
const txHash = fixture.transaction.hash;
const address = fixture.transaction.to;
const encode = value => Buffer.from(JSON.stringify(value));
const envelope = (req, result) => encode({ jsonrpc: '2.0', id: req.id, result });
function provider(overrides = {}) {
  const calls = [];
  const transport = async (req, signal, maxBytes) => {
    calls.push(structuredClone(req));
    const defaults = {
      eth_chainId: fixture.chain_id_hex,
      eth_getTransactionByHash: fixture.transaction,
      eth_getTransactionReceipt: fixture.receipt,
      eth_getBlockByHash: fixture.block,
      eth_getBlockByNumber: fixture.block,
      eth_getBalance: '0x0', eth_getCode: '0x', eth_getLogs: [],
    };
    const value = Object.hasOwn(overrides, req.method) ? overrides[req.method] : defaults[req.method];
    return typeof value === 'function' ? value(req, signal, maxBytes) : envelope(req, structuredClone(value));
  };
  return { calls, transport, adapter: new EthereumAdapter(transport, { backoffMs: 0 }) };
}

test('Sepolia acquisition verifies chain and canonical snapshot with byte evidence', async () => {
  const { adapter, calls } = provider();
  const result = await adapter.investigate(txHash);
  assert.equal(result.status, 'ok');
  assert.equal(result.execution_status, 'success');
  assert.equal(result.chain_id, '11155111');
  assert.equal(result.snapshot.finality, 'unknown');
  assert.equal(result.raw.transaction.value, '0xde0b6b3a7640000');
  assert.deepEqual(calls.map(c => c.method), ['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByHash', 'eth_getBlockByNumber']);
  for (const evidence of result.evidence) {
    assert.equal(evidence.sha256, createHash('sha256').update(evidence.raw_utf8).digest('hex'));
    assert.equal(JSON.parse(evidence.raw_utf8).id, evidence.request_id);
  }
});

test('chain mismatch stops before data calls', async () => {
  const { adapter, calls } = provider({ eth_chainId: '0x1' });
  await assert.rejects(adapter.investigate(txHash), { code: 'UNSUPPORTED_CHAIN' });
  assert.equal(calls.length, 1);
});

test('reorg error preserves successful raw evidence and attempt journal', async () => {
  const { adapter } = provider({ eth_getBlockByNumber: { ...fixture.block, hash: `0x${'2'.repeat(64)}` } });
  await assert.rejects(adapter.investigate(txHash), error => {
    assert.equal(error.code, 'INCONSISTENT_SNAPSHOT');
    assert.equal(error.evidence.length, 5);
    assert.equal(error.attempts.length, 5);
    assert.equal(JSON.parse(error.evidence[1].raw_utf8).result.hash, txHash);
    return true;
  });
});

test('not found does not invent a receipt or execution', async () => {
  const { adapter, calls } = provider({ eth_getTransactionByHash: null });
  const result = await adapter.investigate(txHash);
  assert.equal(result.status, 'not_found');
  assert.equal(result.execution_status, 'unknown');
  assert.equal(calls.length, 2);
});

test('pending vs missing included receipt', async () => {
  const pending = provider({ eth_getTransactionByHash: { ...fixture.transaction, blockHash: null, blockNumber: null }, eth_getTransactionReceipt: null });
  assert.equal((await pending.adapter.investigate(txHash)).execution_status, 'pending');
  assert.equal(pending.calls.length, 3);
  const included = await provider({ eth_getTransactionReceipt: null }).adapter.investigate(txHash);
  assert.equal(included.status, 'partial');
  assert.equal(included.execution_status, 'unknown');
  assert.ok(included.warnings.includes('RECEIPT_NOT_AVAILABLE'));
});

test('missing block is explicitly unconfirmed, reverted reason remains unknown', async () => {
  const result = await provider({ eth_getBlockByHash: null, eth_getTransactionReceipt: { ...fixture.receipt, status: '0x0' } }).adapter.investigate(txHash);
  assert.equal(result.status, 'partial');
  assert.equal(result.execution_status, 'reverted');
  assert.ok(result.warnings.includes('SNAPSHOT_NOT_CONFIRMED'));
  assert.ok(result.warnings.includes('REVERT_REASON_UNKNOWN'));
  assert.equal(result.capabilities.trace, 'unsupported');
});

for (const [name, overrides] of [
  ['receipt mismatch', { eth_getTransactionReceipt: { ...fixture.receipt, transactionHash: `0x${'2'.repeat(64)}` } }],
  ['tx mismatch', { eth_getTransactionByHash: { ...fixture.transaction, hash: `0x${'2'.repeat(64)}` } }],
  ['block membership', { eth_getBlockByHash: { ...fixture.block, transactions: [] } }],
  ['reorg', { eth_getBlockByNumber: { ...fixture.block, hash: `0x${'2'.repeat(64)}` } }],
]) {
  test(`reject inconsistent snapshot: ${name}`, async () => {
    await assert.rejects(provider(overrides).adapter.investigate(txHash), { code: 'INCONSISTENT_SNAPSHOT' });
  });
}

test('zero native balance pinned before and after state read', async () => {
  const { adapter, calls } = provider();
  const result = await adapter.getBalance(address, { tag: 'latest' });
  assert.equal(result.data, '0x0');
  assert.equal(result.snapshot.block_number, '1');
  assert.deepEqual(calls.find(c => c.method === 'eth_getBalance').params, [address, '0x1']);
  assert.equal(calls.filter(c => c.method === 'eth_getBlockByNumber').length, 3);
});

test('code preserves empty bytecode and finalized tag is not relabeled latest', async () => {
  const result = await provider().adapter.getCode(address, { tag: 'finalized' });
  assert.equal(result.data, '0x');
  assert.equal(result.snapshot.finality, 'finalized');
});

test('state reorg after read fails', async () => {
  let reads = 0;
  const { adapter } = provider({ eth_getBlockByNumber: req => envelope(req, ++reads === 3 ? { ...fixture.block, hash: `0x${'d'.repeat(64)}` } : fixture.block) });
  await assert.rejects(adapter.getBalance(address, { tag: 'latest' }), { code: 'INCONSISTENT_SNAPSHOT' });
});

const log = { address, blockHash: fixture.block.hash, blockNumber: '0x1', transactionHash: txHash,
  transactionIndex: '0x0', logIndex: '0x0', topics: [], data: '0x', removed: false };
test('raw logs use blockHash and preserve data', async () => {
  const { adapter, calls } = provider({ eth_getLogs: [log] });
  assert.deepEqual((await adapter.getLogs(address, { number: '1' })).data, [log]);
  assert.deepEqual(calls.find(c => c.method === 'eth_getLogs').params, [{ address, blockHash: fixture.block.hash }]);
});
test('logs of another address and duplicate log index are rejected', async () => {
  for (const logs of [[{ ...log, address: fixture.transaction.from }], [log, log]]) {
    await assert.rejects(provider({ eth_getLogs: logs }).adapter.getLogs(address, { number: '1' }), { code: 'INCONSISTENT_SNAPSHOT' });
  }
});
test('receipt logs must belong to the investigated transaction', async () => {
  await assert.rejects(provider({ eth_getTransactionReceipt: { ...fixture.receipt, logs: [{ ...log, transactionHash: `0x${'2'.repeat(64)}` }] } }).adapter.investigate(txHash), { code: 'INCONSISTENT_SNAPSHOT' });
});

test('bad inputs rejected before transport', async () => {
  const { adapter, calls } = provider();
  for (const ref of [{}, { tag: 'pending' }, { number: '-1' }, { number: '1', tag: 'latest' }, { hash: 'bad' }]) {
    await assert.rejects(adapter.getBlock(ref), { code: 'INVALID_INPUT' });
  }
  await assert.rejects(adapter.investigate('bad'), { code: 'INVALID_INPUT' });
  await assert.rejects(adapter.getBalance('bad', { number: '1' }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 0);
});

test('RPC allowlist blocks mutation, debug and arbitrary arguments', async () => {
  const { transport, calls } = provider();
  const session = new RpcSession(transport);
  for (const method of ['eth_sendRawTransaction', 'eth_call', 'debug_traceTransaction', 'personal_sign', 'admin_peers']) {
    await assert.rejects(session.call(method, []), { code: 'POLICY_DENIED' });
  }
  await assert.rejects(session.call('eth_getBalance', [address, 'latest']), { code: 'INVALID_INPUT' });
  await assert.rejects(session.call('eth_getLogs', [{ address, fromBlock: '0x0' }]), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 0);
});

test('unsupported and pruned errors are explicit, safe, not retried', async () => {
  for (const [code, message, expected] of [[-32601, 'secret endpoint key', 'UNSUPPORTED_CAPABILITY'], [-32000, 'missing trie node: secret', 'PRUNED_STATE']]) {
    const { adapter, calls } = provider({ eth_getBalance: req => encode({ jsonrpc: '2.0', id: req.id, error: { code, message } }) });
    await assert.rejects(adapter.getBalance(address, { number: '1' }), error => {
      assert.equal(error.code, expected); assert.equal(error.message.includes('secret'), false); return true;
    });
    assert.equal(calls.filter(c => c.method === 'eth_getBalance').length, 1);
  }
});

test('one retry for rate limit is journaled and bounded', async () => {
  let calls = 0;
  const session = new RpcSession(async req => {
    if (++calls === 1) throw new AdapterError('RATE_LIMITED', true);
    return envelope(req, '0xaa36a7');
  }, { backoffMs: 0 });
  assert.equal(await session.call('eth_chainId', []), '0xaa36a7');
  assert.deepEqual(session.attempts.map(a => a.outcome), ['RATE_LIMITED', 'ok']);
  const failing = new RpcSession(async () => { throw new AdapterError('RATE_LIMITED', true); }, { backoffMs: 0 });
  await assert.rejects(failing.call('eth_chainId', []), { code: 'RATE_LIMITED' });
  assert.equal(failing.attempts.length, 2);
});

test('timeouts abort transport; global request budget cannot be exceeded', async () => {
  let aborted = 0;
  const transport = (_req, signal) => new Promise(() => { signal.addEventListener('abort', () => aborted++); });
  const session = new RpcSession(transport, { timeoutMs: 5, backoffMs: 0 });
  await assert.rejects(session.call('eth_chainId', []), { code: 'TIMEOUT' });
  assert.equal(aborted, 2);
  const limited = new RpcSession(async () => { throw new AdapterError('RATE_LIMITED', true); }, { maxCalls: 1 });
  await assert.rejects(limited.call('eth_chainId', []), { code: 'BUDGET_EXCEEDED' });
  assert.equal(limited.attempts.length, 1);
});

test('deadline expires without issuing subsequent requests', async () => {
  const { calls, transport } = provider();
  const session = new RpcSession(transport, { deadlineMs: 1 });
  await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(session.call('eth_chainId', []), { code: 'BUDGET_EXCEEDED' });
  assert.equal(calls.length, 0);
});

test('reject invalid envelopes and oversized body', async () => {
  for (const payload of [{ jsonrpc: '2.0', id: 999, result: null }, { jsonrpc: '1.0', id: 1, result: null },
    { jsonrpc: '2.0', id: 1 }, { jsonrpc: '2.0', id: 1, result: null, error: {} }]) {
    await assert.rejects(new RpcSession(async () => encode(payload)).call('eth_chainId', []), { code: 'PROVIDER_ERROR' });
  }
  await assert.rejects(new RpcSession(async () => Buffer.alloc(2097153)).call('eth_chainId', []), { code: 'SIZE_LIMIT' });
});

test('evidence preserves original UTF-8 bytes including a BOM', async () => {
  const session = new RpcSession(async req => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), envelope(req, '0xaa36a7')]));
  assert.equal(await session.call('eth_chainId', []), '0xaa36a7');
  const captured = session.evidence[0];
  assert.equal(captured.sha256, createHash('sha256').update(captured.raw_utf8).digest('hex'));
});

test('DNS policy denies private/reserved/IPv6 targets', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'invalid']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
});

test('fixture adapter implements same investigation semantics without RPC', async () => {
  const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
  for (const [id, digit, expected] of [['synthetic-native-success', '1', 'success'], ['synthetic-reverted', '2', 'reverted'], ['synthetic-pending', '3', 'pending']]) {
    const adapter = new FixtureAdapter(root, id);
    const result = await adapter.investigate(`0x${digit.repeat(64)}`);
    assert.equal(result.execution_status, expected);
    assert.equal(result.mode, 'synthetic');
    assert.equal(result.attempts.length, 0);
    assert.equal((await adapter.investigate(`0x${'f'.repeat(64)}`)).status, 'not_found');
  }
});
