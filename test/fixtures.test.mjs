import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadFixture } from '../dist/fixtures/loader.js';
import { replayFixture } from '../dist/replay.js';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const id = 'synthetic-native-success';
const digest = data => createHash('sha256').update(data).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'bti-fixtures-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixtureRoot = join(dir, 'fixtures');
  const scenario = join(fixtureRoot, id);
  await mkdir(fixtureRoot);
  await cp(join(root, id), scenario, { recursive: true });
  return { dir, fixtureRoot, scenario };
}

async function manifestAt(scenario, mutate) {
  const file = join(scenario, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  mutate(manifest);
  await writeFile(file, json(manifest));
}

async function artifactAt(scenario, role, mutate) {
  const file = join(scenario, `${role}.json`);
  const current = JSON.parse(await readFile(file, 'utf8'));
  const replacement = mutate(current);
  const bytes = Buffer.from(json(replacement === undefined ? current : replacement));
  await writeFile(file, bytes);
  await manifestAt(scenario, m => {
    const artifact = m.artifacts.find(a => a.role === role);
    artifact.sha256 = digest(bytes);
    artifact.bytes = bytes.length;
  });
}

for (const [fixtureId, execution, coverage, missing] of [
  ['synthetic-native-success', 'success', 'complete', []],
  ['synthetic-reverted', 'reverted', 'complete', []],
  ['synthetic-pending', 'pending', 'partial', ['receipt', 'block']],
]) {
  test(`golden replay: ${fixtureId}`, async () => {
    const result = await replayFixture(root, fixtureId);
    assert.equal(result.execution_status, execution);
    assert.deepEqual(result.coverage, { status: coverage, scope: 'transaction-receipt-block', missing });
    assert.equal(result.source_kind, 'synthetic');
    assert.equal(result.chain_id, '31337');
    assert.equal(result.raw_log_count, execution === 'pending' ? null : 0);
    assert.equal(result.snapshot.block_number, execution === 'pending' ? null : '1');
    assert.match(result.replay_id, /^[0-9a-f]{64}$/);
    assert.equal(result.manifest_sha256, digest(await readFile(join(root, fixtureId, 'manifest.json'))));
    assert.deepEqual(await replayFixture(root, fixtureId), result);
  });
}

test('raw payload retains uint256 and unknown fields; frozen after verification', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  const value = `0x${'f'.repeat(64)}`;
  await artifactAt(scenario, 'transaction', tx => { tx.value = value; tx.futureField = { raw: 'untouched' }; });
  const result = await loadFixture(fixtureRoot, id);
  assert.equal(result.raw.transaction.value, value);
  assert.deepEqual(result.raw.transaction.futureField, { raw: 'untouched' });
  assert.throws(() => { result.raw.transaction.futureField.raw = 'tampered'; }, TypeError);
  assert.throws(() => { result.manifest.artifacts[0].sha256 = 'bad'; }, TypeError);
});

for (const invalidId of ['../secret', '..', 'a/b', 'a\\b', 'C:\\secret', '%2e%2e', '', 'A', 'a'.repeat(101)]) {
  test(`reject fixture id ${JSON.stringify(invalidId)}`, async () => {
    await assert.rejects(loadFixture(root, invalidId), { code: 'INVALID_FIXTURE_ID' });
  });
}

for (const [name, mutate] of [
  ['unknown schema', m => { m.schema_version = '2.0.0'; }],
  ['extra property', m => { m.rpc_url = 'https://untrusted.invalid'; }],
  ['duplicate role', m => { m.artifacts[1].role = 'transaction'; }],
  ['missing role', m => { m.artifacts.pop(); }],
  ['path escape', m => { m.artifacts[0].file = '../secret.json'; }],
  ['absolute path', m => { m.artifacts[0].file = 'C:\\secret.json'; }],
  ['wrong fixture identity', m => { m.fixture_id = 'other-fixture'; }],
  ['false provenance', m => { m.source_kind = 'testnet_capture'; }],
  ['invalid date', m => { m.captured_at = '2026-02-31T00:00:00.000Z'; }],
  ['incoherent nullable snapshot', m => { m.snapshot.block_number = null; }],
  ['unsupported capability', m => { m.capabilities.trace = true; }],
  ['artifact references manifest', m => { m.artifacts[0].file = 'manifest.json'; }],
]) {
  test(`reject manifest: ${name}`, async t => {
    const { fixtureRoot, scenario } = await setup(t);
    await manifestAt(scenario, mutate);
    await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INVALID_MANIFEST' });
  });
}

test('reject tampering even when length is unchanged', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  const file = join(scenario, 'receipt.json');
  await writeFile(file, (await readFile(file, 'utf8')).replace('"status": "0x1"', '"status": "0x0"'));
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INTEGRITY_MISMATCH' });
});

test('reject wrong declared byte length', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  await manifestAt(scenario, m => { m.artifacts[0].bytes += 1; });
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INTEGRITY_MISMATCH' });
});

for (const file of ['manifest.json', 'transaction.json']) {
  test(`size bound: ${file}`, async t => {
    const { fixtureRoot, scenario } = await setup(t);
    await writeFile(join(scenario, file), Buffer.alloc(file === 'manifest.json' ? 65537 : 2097153, 32));
    await assert.rejects(loadFixture(fixtureRoot, id), { code: 'SIZE_LIMIT' });
  });
}

test('malformed JSON and invalid UTF-8 are rejected', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  for (const bytes of [Buffer.from('{'), Buffer.from([0xff])]) {
    await writeFile(join(scenario, 'transaction.json'), bytes);
    await manifestAt(scenario, m => { m.artifacts[0].sha256 = digest(bytes); m.artifacts[0].bytes = bytes.length; });
    await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INVALID_PAYLOAD' });
  }
});

test('unsafe JSON numeric values are rejected', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  await artifactAt(scenario, 'transaction', tx => { tx.value = Number.MAX_SAFE_INTEGER + 1; });
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INVALID_PAYLOAD' });
});

for (const [role, mutate] of [
  ['receipt', r => { r.blockHash = `0x${'d'.repeat(64)}`; }],
  ['receipt', r => { r.transactionHash = `0x${'d'.repeat(64)}`; }],
  ['block', b => { b.number = '0x2'; }],
  ['block', b => { b.transactions = []; }],
  ['transaction', tx => { tx.chainId = '0x1'; }],
  ['transaction', tx => { tx.blockNumber = null; }],
]) {
  test(`inconsistent snapshot: ${role} / ${mutate}`, async t => {
    const { fixtureRoot, scenario } = await setup(t);
    await artifactAt(scenario, role, mutate);
    await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INCONSISTENT_SNAPSHOT' });
  });
}

test('missing included receipt is unknown, not reverted', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  await artifactAt(scenario, 'receipt', () => null);
  const result = await replayFixture(fixtureRoot, id);
  assert.equal(result.execution_status, 'unknown');
  assert.equal(result.raw_log_count, null);
  assert.deepEqual(result.coverage.missing, ['receipt']);
});

test('receipt without block cannot establish a consistent snapshot', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  await artifactAt(scenario, 'block', () => null);
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'INCONSISTENT_SNAPSHOT' });
});

test('artifact must be a regular file', async t => {
  const { fixtureRoot, scenario } = await setup(t);
  await rm(join(scenario, 'transaction.json'));
  await mkdir(join(scenario, 'transaction.json'));
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'PATH_DENIED' });
});

test('fixture directory junction cannot escape root', async t => {
  const { dir, fixtureRoot } = await setup(t);
  const outside = join(dir, 'outside');
  await cp(join(root, id), outside, { recursive: true });
  await symlink(outside, join(fixtureRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(loadFixture(fixtureRoot, 'escape'), { code: 'PATH_DENIED' });
});

test('artifact symlink cannot escape fixture directory', { skip: process.platform === 'win32' ? 'File symlinks require Windows privilege; required in Linux CI.' : false }, async t => {
  const { dir, fixtureRoot, scenario } = await setup(t);
  const outside = join(dir, 'outside.json');
  await cp(join(scenario, 'transaction.json'), outside);
  await rm(join(scenario, 'transaction.json'));
  await symlink(outside, join(scenario, 'transaction.json'));
  await assert.rejects(loadFixture(fixtureRoot, id), { code: 'PATH_DENIED' });
});

test('missing fixture returns a safe typed error', async () => {
  await assert.rejects(loadFixture(root, 'missing-fixture'), error => {
    assert.equal(error.code, 'IO_ERROR');
    assert.equal(error.message.includes(root), false);
    return true;
  });
});
