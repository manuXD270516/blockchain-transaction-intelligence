import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemo, renderDemo } from '../dist/demo/build.js';
import { auditSite } from '../dist/demo/site.js';
import { runEvaluation } from '../dist/evals/runner.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLEAN = {
  rag: { passed: true, metrics: { cases: 10, recall_at_5: 1, mrr_at_10: 0.9, abstention: 1 } },
  agent: { passed: true, metrics: { cases: 10, tool_selection: 1, forbidden_executions: 0 } },
  review: { passed: true, metrics: { cases: 11, status_accuracy: 1, unresolved_published_evidence: 0, automatic_accusations: 0,
    promoted_inferences: 0, accepted_with_unsupported: 0, forbidden_executions: 0 } },
};
const evaluation = runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: async name => structuredClone(CLEAN[name]) });
const evaluate = async () => structuredClone(await evaluation);

async function temp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'bti-demo-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function config(dir, patch) {
  const base = JSON.parse(await readFile(join(ROOT, 'demo/fixtures.json'), 'utf8'));
  const path = join(dir, 'fixtures.json');
  await writeFile(path, JSON.stringify(patch(base)));
  return path;
}

test('curated demo renders every fixture reproducibly with visible limits and no active content', async () => {
  const first = await renderDemo({ evaluate });
  const second = await renderDemo({ evaluate });
  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual([...first.files.keys()].sort(), ['evaluation.html', 'fixtures/synthetic-native-success.html',
    'fixtures/synthetic-pending.html', 'fixtures/synthetic-reverted.html', 'fixtures/synthetic-token-events.html', 'index.html']);
  assert.deepEqual(auditSite(first.files), []);
  const index = first.files.get('index.html');
  for (const text of ['Límites', 'Privacidad', 'No conecta wallets', 'sin JavaScript', 'Gates de seguridad aprobadas']) assert.ok(index.includes(text), text);
  const reverted = first.files.get('fixtures/synthetic-reverted.html');
  assert.ok(reverted.includes('receipt_reports_reverted') && reverted.includes('class="reverted"'));
  assert.ok(reverted.includes('MODEL_PROVIDER_NOT_CONFIGURED'));
  for (const html of first.files.values()) assert.ok(html.includes("default-src 'none'"));
  assert.equal(Object.keys(first.manifest.fixtures).length, 4);
});

test('blocked release refuses to build and writes nothing', async () => temp(async dir => {
  const out = join(dir, 'site');
  const blocked = async () => {
    const result = await evaluate();
    return { ...result, release_blocked: true, gates: result.gates.map(gate => gate.id === 'agent_forbidden_executions_zero'
      ? { ...gate, value: 1, status: 'failed' } : gate) };
  };
  await assert.rejects(buildDemo({ out, evaluate: blocked }), error => error.code === 'RELEASE_BLOCKED'
    && error.problems.includes('agent_forbidden_executions_zero'));
  await assert.rejects(readdir(out), { code: 'ENOENT' });
}));

test('tampered curated fixture fails the build', async () => temp(async dir => {
  await cp(join(ROOT, 'fixtures'), dir, { recursive: true });
  const receipt = join(dir, 'synthetic-token-events', 'receipt.json');
  await writeFile(receipt, `${await readFile(receipt, 'utf8')} `);
  await assert.rejects(renderDemo({ fixtures_root: dir, evaluate }), error => error.code === 'INVALID_DEMO_FIXTURE'
    && error.problems[0] === 'synthetic-token-events');
}));

test('hostile HTML in curated text is escaped while URLs are rejected', async () => temp(async dir => {
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const escaped = await renderDemo({ evaluate, config: await config(dir, base => {
    base.fixtures[0].title = hostile; base.fixtures[0].lesson = `"><b onmouseover=x>${hostile}`; return base;
  }) });
  assert.deepEqual(auditSite(escaped.files), []);
  assert.ok(escaped.files.get('index.html').includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  for (const url of ['javascript:alert(1)', 'see https://evil.example', 'data:text/html,x', 'go //evil.example']) {
    await assert.rejects(renderDemo({ evaluate, config: await config(dir, base => { base.fixtures[1].lesson = url; return base; }) }),
      { code: 'INVALID_DEMO_CONFIG' }, url);
  }
  await assert.rejects(renderDemo({ evaluate, config: await config(dir, base => {
    base.fixtures.push(base.fixtures[0]); return base; }) }), { code: 'INVALID_DEMO_CONFIG' });
}));

test('site audit flags active content, external URLs and broken links', async () => {
  const { files } = await renderDemo({ evaluate });
  const inject = (path, html) => auditSite(new Map([...files, [path, files.get(path).replace('</body>', `${html}</body>`)]]));
  assert.ok(inject('index.html', '<script>x</script>').some(item => item.includes('script element')));
  assert.ok(inject('index.html', '<form></form>').some(item => item.includes('form element')));
  assert.ok(inject('index.html', '<a href="https://example.org">x</a>').some(item => item.includes('absolute or executable URL')));
  assert.ok(inject('index.html', '<a href="missing.html">x</a>').some(item => item.includes('invalid link missing.html')));
  assert.ok(inject('fixtures/synthetic-reverted.html', '<a href="#edge-0000000000000000">x</a>').some(item => item.includes('broken anchor')));
  assert.ok(inject('index.html', '<p style="background:url(x)">x</p>').some(item => item.includes('CSS url()')));
  const noCsp = new Map([...files, ['index.html', files.get('index.html').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')]]);
  assert.ok(auditSite(noCsp).some(item => item.includes('missing strict CSP')));
});

test('output directory must be safe and only replaces previous demo builds', async () => temp(async dir => {
  for (const out of [ROOT, join(ROOT, 'fixtures'), join(ROOT, 'src', 'site'), join(ROOT, 'corpus'), join(ROOT, '..')]) {
    await assert.rejects(buildDemo({ out, evaluate }), { code: 'UNSAFE_OUTPUT_DIR' }, out);
  }
  const foreign = join(dir, 'foreign');
  await mkdir(foreign);
  await writeFile(join(foreign, 'keep.txt'), 'x');
  await assert.rejects(buildDemo({ out: foreign, evaluate }), { code: 'OUTPUT_DIR_NOT_EMPTY' });
  assert.equal(await readFile(join(foreign, 'keep.txt'), 'utf8'), 'x');
  const out = join(dir, 'site');
  const manifest = await buildDemo({ out, evaluate });
  await writeFile(join(out, 'stale.html'), 'old');
  assert.deepEqual(await buildDemo({ out, evaluate }), manifest);
  assert.deepEqual((await readdir(out)).sort(), ['evaluation.html', 'fixtures', 'index.html', 'manifest.json']);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')), manifest);
}));

test('demo CLI builds offline under the network guard and never publishes', async () => temp(async dir => {
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const out = join(dir, 'site');
  const run = spawnSync(process.execPath, ['--import', guard, join(ROOT, 'dist', 'demo-cli.js'), 'build', '--out', out],
    { encoding: 'utf8', timeout: 240000 });
  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.built, true);
  assert.equal(summary.published, false);
  assert.equal(summary.files, 6);
  const bad = spawnSync(process.execPath, ['--import', guard, join(ROOT, 'dist', 'demo-cli.js'), 'publish'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'INVALID_INPUT');
}));
