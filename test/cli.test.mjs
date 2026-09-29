import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const guard = new URL('./offline-guard.mjs', import.meta.url).href;
function run(args, guarded = true) {
  return spawnSync(process.execPath, [...(guarded ? ['--import', guard] : []), cli, ...args], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 10000,
  });
}

for (const fixture of ['synthetic-native-success', 'synthetic-reverted', 'synthetic-pending']) {
  test(`CLI offline and cwd-independent: ${fixture}`, () => {
    const first = run(['replay', fixture]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, '');
    assert.equal(JSON.parse(first.stdout).fixture_id, fixture);
    assert.equal(run(['replay', fixture]).stdout, first.stdout);
    assert.equal(run(['replay', fixture], false).stdout, first.stdout);
  });
}

test('offline guard actually rejects network imports and fetch', () => {
  for (const code of ['await import("node:net")', 'await fetch("https://example.invalid")', 'await import("node:child_process")']) {
    const result = spawnSync(process.execPath, ['--import', guard, '--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /OFFLINE_POLICY_DENIED/);
  }
});

for (const args of [[], ['send'], ['replay'], ['replay', 'synthetic-pending', '--rpc-url=x']]) {
  test(`invalid usage ${JSON.stringify(args)}`, () => {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Usage:/);
  });
}

test('fixture errors are structured and do not echo unsafe input', () => {
  const result = run(['replay', '../secret-token']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_FIXTURE_ID');
  assert.equal(result.stderr.includes('secret-token'), false);
});
