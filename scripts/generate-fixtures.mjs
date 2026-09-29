// Maintainer-only deterministic authoring utility; never called by loader or tests.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const hash = digit => `0x${digit.repeat(64)}`;
const address = digit => `0x${digit.repeat(40)}`;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const addressTopic = digit => `0x${'0'.repeat(24)}${digit.repeat(40)}`;
const topics = {
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  single: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
  batch: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
};
const scenarios = [
  { id: 'synthetic-native-success', digit: '1', status: '0x1', description: 'Synthetic successful native transfer. Not a public transaction.' },
  { id: 'synthetic-reverted', digit: '2', status: '0x0', description: 'Synthetic reverted transaction; reason unavailable. Not a public transaction.' },
  { id: 'synthetic-pending', digit: '3', status: null, description: 'Synthetic pending transaction without receipt or block. Not a public transaction.' },
  { id: 'synthetic-token-events', digit: '4', status: '0x1', description: 'Synthetic standard token event layouts plus one unknown event. Not a public transaction.', tokenEvents: true },
];

for (const scenario of scenarios) {
  const dir = join(root, scenario.id);
  await mkdir(dir, { recursive: true });
  const pending = scenario.status === null;
  const txHash = hash(scenario.digit);
  const blockHash = pending ? null : hash('a');
  const transaction = {
    hash: txHash, chainId: '0x7a69', from: address('b'), to: address('c'),
    nonce: '0x0', value: '0xde0b6b3a7640000', input: '0x', type: '0x2',
    gas: '0x5208', maxFeePerGas: '0x77359400', maxPriorityFeePerGas: '0x3b9aca00',
    blockHash, blockNumber: pending ? null : '0x1', transactionIndex: pending ? null : '0x0',
  };
  const makeLog = (index, emitter, eventTopics, data) => ({
    address: address(emitter), blockHash, blockNumber: '0x1', data,
    logIndex: `0x${index.toString(16)}`, removed: false, topics: eventTopics,
    transactionHash: txHash, transactionIndex: '0x0',
  });
  const logs = scenario.tokenEvents ? [
    makeLog(0, 'd', [topics.transfer, addressTopic('1'), addressTopic('2')], `0x${word(42)}`),
    makeLog(1, 'e', [topics.transfer, addressTopic('2'), addressTopic('3'), `0x${word(99)}`], '0x'),
    makeLog(2, 'f', [topics.single, addressTopic('4'), addressTopic('1'), addressTopic('2')], `0x${word(7)}${word(3)}`),
    makeLog(3, '8', [topics.batch, addressTopic('4'), addressTopic('1'), addressTopic('2')],
      `0x${word(64)}${word(160)}${word(2)}${word(1)}${word(2)}${word(2)}${word(10)}${word(20)}`),
    makeLog(4, '9', [`0x${'f'.repeat(64)}`], '0x'),
  ] : [];
  const receipt = pending ? null : {
    transactionHash: txHash, transactionIndex: '0x0', blockHash, blockNumber: '0x1',
    from: address('b'), to: address('c'), contractAddress: null, status: scenario.status,
    gasUsed: '0x5208', cumulativeGasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00',
    logs, logsBloom: `0x${'0'.repeat(512)}`, type: '0x2',
  };
  const block = pending ? null : {
    hash: blockHash, parentHash: hash('0'), number: '0x1', timestamp: '0x1', transactions: [txHash],
  };
  const artifacts = [];
  for (const [role, value] of Object.entries({ transaction, receipt, block })) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const file = `${role}.json`;
    await writeFile(join(dir, file), bytes);
    artifacts.push({ role, file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  const manifest = {
    schema_version: '1.0.0', fixture_id: scenario.id, scenario_id: `synthetic:${scenario.id.slice(10)}`,
    source_kind: 'synthetic', chain_id: '31337', description: scenario.description,
    captured_at: '2026-09-24T00:00:00.000Z',
    source: { publisher: 'blockchain-transaction-intelligence', uri: null, license: 'CC0-1.0' },
    adapter_version: 'fixture-loader/1.0.0', decoder_version: null, corpus_snapshot: null, split: 'dev',
    capabilities: { receipts: true, logs: true, historical_state: false, safe_finalized: false, trace: false, abi_enrichment: false },
    snapshot: { tx_hash: txHash, block_hash: blockHash, block_number: pending ? null : '1' }, artifacts,
  };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
