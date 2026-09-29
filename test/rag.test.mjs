import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from '../dist/rag/loader.js';
import { CorpusError } from '../dist/rag/errors.js';

const root = fileURLToPath(new URL('../corpus/snapshots/m5-v1/', import.meta.url));

test('curated corpus resolves every document, vector and exact citation span', async () => {
  const corpus = await loadCorpus(root);
  assert.equal(corpus.manifest.corpus_snapshot_id, 'd9fcac75b6b1e87c38273e826630547676101b8fa70892709bad267df2b8b8c1');
  assert.equal(corpus.documents.size, 6);
  assert.equal(corpus.chunks.length, 139);
  assert.equal(corpus.vectors.length, corpus.chunks.length);
  for (const chunk of corpus.chunks) {
    const document = corpus.documents.get(chunk.document_id);
    assert.ok(document);
    assert.equal(document.canonical_text.slice(chunk.start, chunk.end), chunk.excerpt);
    assert.equal(corpus.vectors[chunk.embedding_index].length, 384);
  }
  const audit = corpus.documents.get('openzeppelin-5.0.0-audit');
  assert.equal(audit.audit.commit, 'b5a3e69');
  assert.ok(corpus.chunks.some(chunk => chunk.document_id === audit.document_id && chunk.page !== null));
});

test('corpus loader rejects an artifact changed after publication', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-tamper-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(root, directory, { recursive: true });
  const path = join(directory, 'chunks.json');
  const chunks = JSON.parse(await readFile(path, 'utf8'));
  chunks[0].excerpt = `${chunks[0].excerpt}tampered`;
  await writeFile(path, JSON.stringify(chunks));
  await assert.rejects(() => loadCorpus(directory), error => error instanceof CorpusError
    && ['INTEGRITY_MISMATCH', 'SIZE_LIMIT'].includes(error.code));
});

test('versioned qrels pass offline retrieval gates', () => {
  const cli = fileURLToPath(new URL('../dist/rag-eval-cli.js', import.meta.url));
  const qrels = fileURLToPath(new URL('../evals/protocol-rag-qrels.json', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--import', guard, cli, qrels], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.ok(report.metrics.recall_at_5 >= 0.85);
  assert.ok(report.metrics.mrr_at_10 >= 0.75);
  assert.equal(report.metrics.abstention, 1);
  assert.equal(report.metrics.version_safe, true);
});

test('source lock contains only pinned approved public artifacts', async () => {
  const lock = JSON.parse(await readFile(new URL('../corpus/sources.json', import.meta.url), 'utf8'));
  assert.equal(lock.sources.length, 6);
  assert.ok(lock.sources.every(source => /^[0-9a-f]{64}$/.test(source.sha256)
    && source.url.startsWith('https://') && !/\/(?:master|latest)\//.test(source.url)
    && ['CC0-1.0', 'MIT'].includes(source.license)));
  assert.equal(lock.model.revision, 'Xenova/all-MiniLM-L6-v2@751bff37182d3f1213fa05d7196b954e230abad9');
  assert.equal(lock.model.license, 'Apache-2.0');
  assert.ok(lock.model.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256)));
});

test('administrative ingestion rejects a non-allowlisted destination before network', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-source-policy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = JSON.parse(await readFile(new URL('../corpus/sources.candidates.json', import.meta.url), 'utf8'));
  candidate.sources[0].url = 'https://127.0.0.1/private';
  const config = join(directory, 'candidate.json');
  await writeFile(config, JSON.stringify(candidate));
  const cli = fileURLToPath(new URL('../dist/rag-admin-cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'lock', config, join(directory, 'locked.json'), join(directory, 'staging')],
    { encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).error.code, 'PATH_DENIED');
});
