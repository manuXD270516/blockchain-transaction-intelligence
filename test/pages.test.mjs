import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemo, verifyDemoOutput } from '../dist/demo/build.js';
import { runEvaluation } from '../dist/evals/runner.js';
import { verifyLive } from '../scripts/verify-pages.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLEAN = {
  rag: { passed: true, metrics: { cases: 10, recall_at_5: 1, mrr_at_10: 0.9, abstention: 1 } },
  agent: { passed: true, metrics: { cases: 10, tool_selection: 1, forbidden_executions: 0 } },
  review: { passed: true, metrics: { cases: 11, status_accuracy: 1, unresolved_published_evidence: 0, automatic_accusations: 0,
    promoted_inferences: 0, accepted_with_unsupported: 0, forbidden_executions: 0 } },
};
const evaluation = runEvaluation({ root: ROOT, latency_repetitions: 1, subeval: async name => structuredClone(CLEAN[name]) });
const evaluate = async () => structuredClone(await evaluation);

async function built(t) {
  const dir = await mkdtemp(join(tmpdir(), 'bti-pages-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = join(dir, 'site');
  const manifest = await buildDemo({ out, evaluate });
  return { out, manifest };
}
const rejectsWith = (promise, fragment) => assert.rejects(promise, error => error.code === 'UNSAFE_OUTPUT'
  && error.problems.some(problem => problem.includes(fragment)));

test('verify accepts the built site and rejects tampered, extra, missing or active files', async t => {
  const { out, manifest } = await built(t);
  assert.equal((await verifyDemoOutput(out)).evaluation_result_id, manifest.evaluation_result_id);
  const index = join(out, 'index.html');
  const original = await readFile(index, 'utf8');
  await writeFile(index, original.replace('</body>', '<p>edited</p></body>'));
  await rejectsWith(verifyDemoOutput(out), 'index.html: hash mismatch');
  await writeFile(index, original.replace('</body>', '<script>alert(1)</script></body>'));
  await rejectsWith(verifyDemoOutput(out), 'index.html: hash mismatch');
  await assert.rejects(verifyDemoOutput(out), error => error.problems.some(problem => /index\.html: .*script/i.test(problem)));
  await writeFile(index, original);
  await writeFile(join(out, 'tracker.html'), original);
  await rejectsWith(verifyDemoOutput(out), 'tracker.html: not listed in manifest');
  await rm(join(out, 'tracker.html'));
  await rm(join(out, 'evaluation.html'));
  await rejectsWith(verifyDemoOutput(out), 'evaluation.html: missing');
  await rm(join(out, 'manifest.json'));
  await rejectsWith(verifyDemoOutput(out), 'manifest.json');
});

test('verify rejects symlinks inside the built site', { skip: process.platform === 'win32' ? 'File symlinks require Windows privilege; covered on Linux CI' : false }, async t => {
  const { out } = await built(t);
  await symlink(join(out, 'index.html'), join(out, 'link.html'));
  await rejectsWith(verifyDemoOutput(out), 'link.html: not a regular file');
});

// Offline stand-in for the Pages host: serves the built files through an injected fetch, no sockets.
function host(out, mutate = (_path, body) => body, headers = {}) {
  const base = 'https://manuxd270516.github.io/blockchain-transaction-intelligence/';
  const fetchImpl = async url => {
    const path = new URL(url).pathname.replace('/blockchain-transaction-intelligence/', '');
    try {
      const body = mutate(path, await readFile(join(out, path)));
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
    } catch { return new Response('', { status: 404 }); }
  };
  return { base, fetchImpl };
}
test('live verification emits published only when every page matches and passes checks', async t => {
  const { out, manifest } = await built(t);
  const ok = await verifyLive({ ...host(out, undefined, { 'x-content-type-options': 'nosniff' }), manifest });
  assert.equal(ok.published, true);
  assert.equal(ok.files, Object.keys(manifest.files).length);
  assert.equal(ok.response_headers['x-content-type-options'], 'nosniff');
  const tampered = await verifyLive({ ...host(out, (path, body) => path === 'index.html'
    ? Buffer.from(body.toString('utf8').replace('</body>', '<script src="https://evil.example/x.js"></script></body>')) : body), manifest });
  assert.equal(tampered.published, false);
  assert.ok(tampered.problems.some(problem => problem === 'index.html: hash mismatch'));
  assert.ok(tampered.problems.some(problem => problem.startsWith('index.html: active content')));
  assert.ok(tampered.problems.includes('index.html: external URL'));
  const secret = await verifyLive({ ...host(out, (path, body) => path === 'evaluation.html'
    ? Buffer.from(body.toString('utf8').replace('</body>', `<p>ghp_${'a'.repeat(36)}</p></body>`)) : body), manifest });
  assert.ok(secret.problems.some(problem => problem.startsWith('evaluation.html: secret pattern')));
  const noCsp = await verifyLive({ ...host(out, (_path, body) => Buffer.from(body.toString('utf8')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''))), manifest });
  assert.ok(noCsp.problems.some(problem => problem.endsWith('missing strict CSP')));
  const missing = await verifyLive({ ...host(join(out, 'nowhere')), manifest });
  assert.ok(missing.problems.every(problem => problem.endsWith('HTTP 404')));
});

test('live verification only targets GitHub Pages project URLs and needs index.html', async () => {
  const manifest = { files: { 'index.html': '0'.repeat(64) }, evaluation_result_id: 'x', demo_version: '1.0.0' };
  const offline = () => { throw new Error('network'); };
  for (const base of ['http://manuxd270516.github.io/repo/', 'https://evil.example/repo/', 'https://a.github.io.evil.example/r/',
    'https://manuxd270516.github.io/repo']) {
    await assert.rejects(verifyLive({ base, manifest, fetchImpl: offline }), { message: 'INVALID_PAGES_URL' });
  }
  await assert.rejects(verifyLive({ base: 'https://manuxd270516.github.io/blockchain-transaction-intelligence/',
    manifest: { ...manifest, files: {} }, fetchImpl: offline }), { message: 'INVALID_MANIFEST' });
});
