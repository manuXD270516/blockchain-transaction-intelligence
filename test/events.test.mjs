import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { FixtureAdapter } from '../dist/adapters/fixture.js';
import { decodeStandardEvent, MAX_BATCH_ITEMS, MAX_LOG_BYTES, TOPICS } from '../dist/events/decode.js';
import { extractTokenEvents } from '../dist/events/extract.js';
import { canonical } from '../dist/normalization/evidence.js';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const hash = digit => `0x${digit.repeat(64)}`;
const topicAddress = digit => `0x${'0'.repeat(24)}${digit.repeat(40)}`;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const digest = value => createHash('sha256').update(value).digest('hex');

test('event signatures are canonical Keccak-256 values', () => {
  const signature = value => `0x${bytesToHex(keccak_256(new TextEncoder().encode(value)))}`;
  assert.equal(TOPICS.transfer, signature('Transfer(address,address,uint256)'));
  assert.equal(TOPICS.single, signature('TransferSingle(address,address,address,uint256,uint256)'));
  assert.equal(TOPICS.batch, signature('TransferBatch(address,address,address,uint256[],uint256[])'));
});

test('strictly distinguishes ERC-20 and ERC-721 shared Transfer layouts', () => {
  const base = [TOPICS.transfer, topicAddress('1'), topicAddress('2')];
  const erc20 = decodeStandardEvent(base, `0x${word(42)}`);
  assert.equal(erc20.status, 'decoded');
  assert.equal(erc20.standard_candidate, 'ERC-20');
  assert.deepEqual(erc20.arguments, { from: `0x${'1'.repeat(40)}`, to: `0x${'2'.repeat(40)}`, value: '42' });
  const erc721 = decodeStandardEvent([...base, `0x${word(99)}`], '0x');
  assert.equal(erc721.standard_candidate, 'ERC-721');
  assert.equal(erc721.arguments.token_id, '99');
  assert.equal(decodeStandardEvent(base, '0x').status, 'ambiguous');
  assert.equal(decodeStandardEvent([TOPICS.transfer, `0x${'1'.repeat(64)}`, topicAddress('2')], `0x${word(1)}`).reason,
    'NON_CANONICAL_ADDRESS_PADDING');
});

test('decodes ERC-1155 single and batch without partial batch expansion', () => {
  const indexed = [topicAddress('4'), topicAddress('1'), topicAddress('2')];
  const single = decodeStandardEvent([TOPICS.single, ...indexed], `0x${word(7)}${word(3)}`);
  assert.deepEqual(single.arguments, { operator: `0x${'4'.repeat(40)}`, from: `0x${'1'.repeat(40)}`,
    to: `0x${'2'.repeat(40)}`, token_id: '7', value: '3' });
  const batchData = `0x${word(64)}${word(160)}${word(2)}${word(1)}${word(2)}${word(2)}${word(10)}${word(20)}`;
  const batch = decodeStandardEvent([TOPICS.batch, ...indexed], batchData);
  assert.equal(batch.status, 'decoded');
  assert.deepEqual(batch.arguments.ids, ['1', '2']);
  assert.deepEqual(batch.arguments.values, ['10', '20']);
  assert.equal(decodeStandardEvent([TOPICS.batch, ...indexed], `0x${word(64)}${word(96)}${word(MAX_BATCH_ITEMS + 1)}${word(0)}`).status, 'limit_exceeded');
  assert.equal(decodeStandardEvent([TOPICS.single, ...indexed], `0x${'00'.repeat(MAX_LOG_BYTES + 1)}`).reason, 'LOG_BYTE_LIMIT');
});

test('fixture extraction retains every log, expands batches and links evidence', async () => {
  const input = structuredClone(await new FixtureAdapter(root, 'synthetic-token-events').investigate(hash('4')));
  const before = structuredClone(input);
  const result = extractTokenEvents(input);
  assert.deepEqual(input, before);
  assert.equal(result.events.length, 5);
  assert.equal(result.transfers.length, 5);
  assert.deepEqual(result.events.map(event => event.status), ['decoded', 'decoded', 'decoded', 'decoded', 'unknown']);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.unknown, 1);
  assert.equal(result.transfers[0].raw_amount, '42');
  assert.deepEqual(result.transfers.slice(3).map(value => [value.token_id, value.raw_amount]), [['1', '10'], ['2', '20']]);
  assert.ok(result.transfers.every(value => value.semantics === 'event_reported' && value.decimals === null));
  const ids = new Set(result.normalized.evidence.map(node => node.evidence_id));
  for (const node of result.derived_evidence) {
    assert.ok(node.parent_evidence_ids.every(parent => ids.has(parent)));
    const { evidence_id, ...body } = node;
    assert.equal(evidence_id, digest(canonical(body)));
    ids.add(evidence_id);
  }
  assert.ok(result.events.flatMap(event => event.evidence_ids).every(id => ids.has(id)));
  assert.ok(result.transfers.flatMap(transfer => transfer.evidence_ids).every(id => ids.has(id)));
  assert.equal(JSON.stringify(result), JSON.stringify(extractTokenEvents(input)));
  assert.throws(() => { result.transfers[0].raw_amount = '0'; }, TypeError);
});

test('missing receipt is partial and never asserts absence of transfers', async () => {
  const input = await new FixtureAdapter(root, 'synthetic-pending').investigate(hash('3'));
  const result = extractTokenEvents(input);
  assert.equal(result.coverage.receipt_available, false);
  assert.equal(result.coverage.status, 'partial');
  assert.ok(result.warnings.includes('RECEIPT_MISSING_CANNOT_ASSERT_NO_TRANSFERS'));
});

test('logs attached to a reverted receipt are inconsistent and produce no transfers', async () => {
  const input = structuredClone(await new FixtureAdapter(root, 'synthetic-token-events').investigate(hash('4')));
  input.raw.receipt.status = '0x0';
  input.execution_status = 'reverted';
  const receiptEvidence = input.evidence.find(value => value.method === 'fixture:receipt');
  receiptEvidence.raw_utf8 = JSON.stringify(input.raw.receipt);
  receiptEvidence.sha256 = digest(receiptEvidence.raw_utf8);
  const result = extractTokenEvents(input);
  assert.equal(result.transfers.length, 0);
  assert.ok(result.events.every(event => event.status === 'inconsistent'));
  assert.ok(result.warnings.includes('REVERTED_RECEIPT_WITH_LOGS'));
});

test('extraction CLI is offline and byte reproducible', () => {
  const cli = fileURLToPath(new URL('../dist/extract-cli.js', import.meta.url));
  const guard = new URL('./offline-guard.mjs', import.meta.url).href;
  const args = ['--import', guard, cli, 'fixture', 'synthetic-token-events'];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
  assert.equal(JSON.parse(first.stdout).transfers.length, 5);
});
