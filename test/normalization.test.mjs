import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { FixtureAdapter } from '../dist/adapters/fixture.js';
import { EthereumAdapter } from '../dist/adapters/ethereum.js';
import { normalizeInvestigation, decimal } from '../dist/normalization/normalize.js';
import { canonical } from '../dist/normalization/evidence.js';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const golden = JSON.parse(await readFile(new URL('./data/normalization-golden.json', import.meta.url), 'utf8'));
const hash = digit => `0x${digit.repeat(64)}`;
const digest = value => createHash('sha256').update(value).digest('hex');
async function input(id = 'synthetic-native-success', digit = '1') {
  return structuredClone(await new FixtureAdapter(root, id).investigate(hash(digit)));
}
// Mutations re-materialize their synthetic sources so consistency tests do not fail on stale evidence first.
function refresh(value) {
  for (const evidence of value.evidence) {
    const role = evidence.method.split(':')[1];
    evidence.raw_utf8 = JSON.stringify(value.raw[role]);
    evidence.sha256 = digest(evidence.raw_utf8);
  }
  return value;
}

for (const [index, id] of Object.keys(golden).entries()) {
  test(`M2 golden: ${id}`, async () => {
    const original = await input(id, String(index + 1));
    const before = structuredClone(original);
    const result = normalizeInvestigation(original);
    const { fields } = result.transaction;
    const actual = { execution_status: result.execution_status, acquisition_status: result.acquisition_status,
      value_wei: fields.value_wei, nonce: fields.nonce, gas_limit: fields.gas_limit, type: fields.type, block_number: fields.block_number,
      execution_fee_wei: result.fees.execution_fee_wei, total_fee_wei: result.fees.total_fee_wei };
    assert.deepEqual(actual, golden[id]);
    assert.deepEqual(original, before);
    assert.equal(JSON.stringify(result), JSON.stringify(normalizeInvestigation(original)));
    assert.throws(() => { result.transaction.fields.value_wei = '1'; }, TypeError);
    assert.throws(() => { result.raw.transaction.value = '0x0'; }, TypeError);
    const { bundle_id, ...body } = result;
    assert.equal(bundle_id, digest(canonical(body)));
    const ids = new Set();
    for (const node of result.evidence) {
      assert.ok(node.parent_evidence_ids.every(parent => ids.has(parent)), 'parents must precede children');
      const { evidence_id, ...rest } = node;
      assert.equal(evidence_id, digest(canonical(rest)));
      ids.add(node.evidence_id);
    }
    assert.ok(ids.has(result.transaction.normalization_evidence_id));
  });
}

test('uint256 maximum and zero are exact; unsafe and malformed numbers are rejected', async () => {
  const value = await input();
  value.raw.transaction.value = `0x${'f'.repeat(64)}`;
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.transaction.fields.value_wei, '115792089237316195423570985008687907853269984665640564039457584007913129639935');
  assert.equal(decimal('0x0'), '0');
  for (const bad of ['0x00', '-1', 1, '0x', `0x1${'0'.repeat(64)}`, '0X10']) assert.throws(() => decimal(bad), { code: 'INVALID_NORMALIZATION_INPUT' });
});

test('creation and unknown transaction type retain raw; total stays unknown', async () => {
  const value = await input();
  value.raw.transaction.to = null;
  value.raw.transaction.type = '0x7f';
  value.raw.transaction.future = { raw: 'preserved' };
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.transaction.fields.is_creation, true);
  assert.equal(result.transaction.fields.to, null);
  assert.equal(result.transaction.fields.type, '127');
  assert.equal(result.receipt.fields.contract_address, null);
  assert.deepEqual(result.raw.transaction.future, { raw: 'preserved' });
  assert.equal(result.fees.total_fee_wei, null);
  assert.ok(result.warnings.includes('UNKNOWN_TRANSACTION_TYPE'));
});

test('missing effective price does not use maxFeePerGas or gasPrice', async () => {
  const value = await input();
  delete value.raw.receipt.effectiveGasPrice;
  value.raw.transaction.gasPrice = '0xff';
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.fees.execution_fee_wei, null);
  assert.equal(result.fees.total_fee_wei, null);
  const node = result.evidence.find(n => n.evidence_id === result.receipt.normalization_evidence_id);
  assert.deepEqual(node.field_sources.effective_gas_price_wei, []);
});

test('blob fees and total derive from actual prices, not caps', async () => {
  const value = await input();
  value.raw.transaction.type = '0x3';
  value.raw.receipt.blobGasUsed = '0x20000';
  value.raw.receipt.blobGasPrice = '0x2';
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.fees.blob_fee_wei, '262144');
  assert.equal(result.fees.total_fee_wei, '21000000262144');
  assert.ok(result.fees.evidence_ids.blob);
  delete value.raw.receipt.blobGasPrice;
  assert.equal(normalizeInvestigation(refresh(value)).fees.total_fee_wei, null);
});

test('extra fee fields prevent a falsely complete total', async () => {
  const value = await input();
  value.raw.receipt.l1Fee = '0x99';
  assert.equal(normalizeInvestigation(refresh(value)).fees.total_fee_wei, null);
});

test('missing receipt is unknown, not reverted', async () => {
  const value = await input();
  value.raw.receipt = null;
  value.status = 'partial'; value.execution_status = 'unknown';
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.execution_status, 'unknown');
  assert.deepEqual(result.coverage.missing, ['receipt']);
});

test('logs get canonical metadata and raw evidence without decoding', async () => {
  const value = await input();
  value.raw.receipt.logs = [{ address: value.raw.transaction.to, blockHash: value.raw.block.hash, blockNumber: '0x1',
    transactionHash: value.raw.transaction.hash, transactionIndex: '0x0', logIndex: '0xa', topics: [hash('d')], data: '0xdead', removed: false }];
  const result = normalizeInvestigation(refresh(value));
  assert.equal(result.logs[0].fields.log_index, '10');
  assert.equal(result.logs[0].fields.data, '0xdead');
  assert.equal(result.logs[0].fields.event_name, undefined);
  const derived = result.evidence.find(n => n.evidence_id === result.logs[0].normalization_evidence_id);
  assert.deepEqual(derived.field_sources.log, ['/logs/0']);
  value.raw.receipt.logs.push(value.raw.receipt.logs[0]);
  assert.throws(() => normalizeInvestigation(refresh(value)), { code: 'INCONSISTENT_NORMALIZATION_SNAPSHOT' });
});

for (const [name, mutate] of [
  ['receipt hash', v => { v.raw.receipt.blockHash = hash('d'); }],
  ['snapshot', v => { v.snapshot.block_number = '9'; }],
  ['chain', v => { v.chain_id = '1'; }],
  ['execution status', v => { v.execution_status = 'reverted'; }],
  ['acquisition status', v => { v.status = 'partial'; }],
  ['block membership', v => { v.raw.block.transactions = []; }],
  ['transaction index', v => { v.raw.transaction.transactionIndex = '0xff'; }],
  ['invalid created contract', v => { v.raw.receipt.contractAddress = v.raw.transaction.from; }],
  ['unsupported finality', v => { v.snapshot.finality = 'finalized'; }],
]) {
  test(`normalizer rejects ${name} independently of adapter validation`, async () => {
    const value = await input(); mutate(value);
    assert.throws(() => normalizeInvestigation(refresh(value)), { code: 'INCONSISTENT_NORMALIZATION_SNAPSHOT' });
  });
}

test('tampered bytes, missing source and unrelated valid source are rejected', async () => {
  const tampered = await input();
  tampered.evidence[0].raw_utf8 += ' ';
  assert.throws(() => normalizeInvestigation(tampered), { code: 'EVIDENCE_INTEGRITY_ERROR' });
  const missing = await input(); missing.evidence = [];
  assert.throws(() => normalizeInvestigation(missing), { code: 'MISSING_EVIDENCE' });
  const unrelated = await input(); unrelated.raw.transaction.value = '0x0';
  assert.throws(() => normalizeInvestigation(unrelated), { code: 'MISSING_EVIDENCE' });
});

test('not_found fixture reports limited scope, not universal inexistence', async () => {
  const data = await new FixtureAdapter(root, 'synthetic-native-success').investigate(hash('f'));
  const result = normalizeInvestigation(data);
  assert.equal(result.transaction, null);
  assert.equal(result.acquisition_status, 'not_found');
  assert.ok(result.warnings.includes('NO_MATCH_WITHIN_FIXTURE_NOT_PROOF_OF_NONEXISTENCE'));
});

test('RPC normalization binds sources to actual request params and chain', async () => {
  const sample = JSON.parse(await readFile(new URL('./data/sepolia-synthetic.json', import.meta.url), 'utf8'));
  const results = { eth_chainId: sample.chain_id_hex, eth_getTransactionByHash: sample.transaction,
    eth_getTransactionReceipt: sample.receipt, eth_getBlockByHash: sample.block, eth_getBlockByNumber: sample.block };
  const adapter = new EthereumAdapter(async req => Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: results[req.method] })));
  const investigation = await adapter.investigate(sample.transaction.hash);
  const result = normalizeInvestigation(investigation);
  assert.equal(result.mode, 'testnet_live');
  const node = result.evidence.find(n => n.evidence_id === result.transaction.normalization_evidence_id);
  assert.deepEqual(node.field_sources.value_wei, ['/result/value']);
  const missingCanonical = structuredClone(investigation);
  missingCanonical.evidence = missingCanonical.evidence.filter(e => e.method !== 'eth_getBlockByNumber');
  assert.throws(() => normalizeInvestigation(missingCanonical), { code: 'MISSING_EVIDENCE' });
  investigation.evidence[1].params = [hash('f')];
  assert.throws(() => normalizeInvestigation(investigation), { code: 'MISSING_EVIDENCE' });
});

test('all cited pointers resolve in a declared parent; optional absence is not a fabricated citation', async () => {
  const result = normalizeInvestigation(await input());
  for (const node of result.evidence.filter(n => n.kind === 'derived')) {
    const parents = node.parent_evidence_ids.map(id => result.evidence.find(n => n.evidence_id === id));
    for (const pointer of Object.values(node.field_sources).flat()) {
      const resolvable = parents.some(parent => {
        let target = parent.source ? JSON.parse(parent.source.raw_utf8) : parent.value;
        for (const key of pointer.slice(1).split('/')) {
          if (target === null || typeof target !== 'object' || !Object.hasOwn(target, key)) return false;
          target = target[key];
        }
        return true;
      });
      assert.ok(resolvable, pointer);
    }
  }
});

test('normalization CLI runs offline and is byte reproducible', () => {
  const cli = fileURLToPath(new URL('../dist/normalize-cli.js', import.meta.url));
  const guard = new URL('./offline-guard.mjs', import.meta.url).href;
  const args = ['--import', guard, cli, 'fixture', 'synthetic-native-success'];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).transaction.fields.value_wei, '1000000000000000000');
  assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).stdout, first.stdout);
  const wrong = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(wrong.status, 2);
});
