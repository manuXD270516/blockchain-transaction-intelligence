import { request } from 'node:https';
import { lookup } from 'node:dns';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as z from 'zod';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { publicIPv4 } from './adapters/rpc.js';
import { parseJson } from './fixtures/validation.js';
import { sha256 } from './fixtures/loader.js';
import { canonical } from './normalization/evidence.js';
import { canonicalMarkdown, chunkDocument } from './rag/chunker.js';
import { MiniLmEmbedder } from './rag/embedder.js';
import { CorpusError } from './rag/errors.js';
import { loadCorpus } from './rag/loader.js';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from './rag/types.js';
import type { CorpusArtifact, CorpusDocument, CorpusDocumentManifest, CorpusManifest } from './rag/types.js';
import { manifestIdentity } from './rag/validation.js';
import { CorpusVersionError, readRegistry, REGISTRY_FILE, registerSnapshot, resolveCitation } from './rag/versions.js';

const HASH = /^[0-9a-f]{64}$/;
const FILE = /^(?![./\\])(?!(?:.*[\\/])?\.\.(?:[\\/]|$))[a-zA-Z0-9._/-]+$/;
const ALLOWED_HOSTS = new Set(['raw.githubusercontent.com', 'huggingface.co', 'cdn-lfs.huggingface.co',
  'cas-bridge.xethub.hf.co', 'us.aws.cdn.hf.co']);
const MAX_DOWNLOAD = 64 * 1024 * 1024;

const source = z.strictObject({
  document_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/), url: z.url(), file: z.string().regex(FILE),
  format: z.enum(['markdown', 'pdf']), sha256: z.string().regex(HASH),
  canonical_uri: z.url(), publisher: z.string().min(1), title: z.string().min(1), protocol: z.string().min(1),
  chain_id: z.union([z.string().regex(/^[1-9][0-9]*$/), z.null()]), deployments: z.array(z.string().regex(/^0x[0-9a-f]{40}$/)),
  version: z.union([z.string().min(1), z.null()]), commit: z.string().regex(/^[0-9a-f]{7,64}$/),
  published_at: z.union([z.iso.datetime(), z.null()]), retrieved_at: z.iso.datetime(), license: z.string().min(1),
  access_conditions: z.string().min(1), trust_tier: z.enum(['normative', 'publisher', 'audit']),
  audit: z.union([z.null(), z.strictObject({ auditor: z.string().min(1), contract: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{7,64}$/), date: z.iso.date(), scope: z.string().min(1) })]),
});
const modelFile = z.strictObject({ url: z.url(), file: z.string().regex(FILE), sha256: z.string().regex(HASH) });
const configSchema = z.strictObject({
  schema_version: z.literal('1.0.0'), created_at: z.iso.datetime(),
  model: z.strictObject({ id: z.literal(EMBEDDING_MODEL), revision: z.string().min(1), license: z.literal('Apache-2.0'),
    files: z.array(modelFile).min(1).max(20) }),
  sources: z.array(source).min(1).max(128),
});
const candidateSchema = z.strictObject({
  schema_version: z.literal('1.0.0'), created_at: z.iso.datetime(),
  model: z.strictObject({ id: z.literal(EMBEDDING_MODEL), revision: z.string().min(1), license: z.literal('Apache-2.0'),
    files: z.array(modelFile.omit({ sha256: true })).min(1).max(20) }),
  sources: z.array(source.omit({ sha256: true })).min(1).max(128),
});
type Config = z.infer<typeof configSchema>;

async function main(): Promise<void> {
  const [command, configPath, first, second] = process.argv.slice(2);
  if (command === 'lock' && configPath && first && second) {
    const candidateBytes = await readFile(configPath);
    const candidate = candidateSchema.safeParse(parseJson(candidateBytes, 'manifest'));
    if (!candidate.success) throw new CorpusError('INVALID_CORPUS');
    const config = await lock(candidate.data, first, second);
    process.stdout.write(`${JSON.stringify({ status: 'ok', sources: config.sources.length, model_files: config.model.files.length })}\n`);
    return;
  }
  if (command === 'fetch' && configPath && first && !second) {
    const config = await readConfig(configPath);
    await fetchAll(config, first);
    process.stdout.write(`${JSON.stringify({ status: 'ok', sources: config.sources.length, model_files: config.model.files.length })}\n`);
    return;
  }
  if (command === 'build' && configPath && first && second) {
    const config = await readConfig(configPath);
    const result = await build(config, first, second);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'register' && configPath && first && !second) {
    // Offline: appends <snapshots-root>/<path> to the version registry; earlier versions are never rewritten.
    const registry = await readRegistry(configPath);
    const corpus = await loadCorpus(resolve(configPath, first));
    const next = registerSnapshot(registry, corpus, first);
    await writeFile(resolve(configPath, REGISTRY_FILE), `${JSON.stringify(next, null, 2)}\n`);
    const entry = next.snapshots.at(-1)!;
    process.stdout.write(`${JSON.stringify({ status: 'ok', corpus_snapshot_id: entry.corpus_snapshot_id, path: entry.path,
      versions: next.snapshots.length, changes: entry.changes })}\n`);
    return;
  }
  if (command === 'resolve' && configPath && first && second) {
    const citation = await resolveCitation(configPath, await readRegistry(configPath), { corpus_snapshot_id: first, chunk_id: second });
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...citation })}\n`);
    return;
  }
  if (command === 'verify' && configPath && !first) {
    const corpus = await loadCorpus(configPath);
    process.stdout.write(`${JSON.stringify({ status: 'ok', corpus_snapshot_id: corpus.manifest.corpus_snapshot_id,
      documents: corpus.documents.size, chunks: corpus.chunks.length })}\n`);
    return;
  }
  throw new CorpusError('INVALID_CORPUS');
}

async function readConfig(path: string): Promise<Config> {
  const bytes = await readFile(path);
  if (bytes.length > 1024 * 1024) throw new CorpusError('SIZE_LIMIT');
  const result = configSchema.safeParse(parseJson(bytes, 'manifest'));
  if (!result.success) throw new CorpusError('INVALID_CORPUS');
  const urls = [...result.data.sources.map(item => item.url), ...result.data.model.files.map(item => item.url)];
  if (urls.some(value => !allowed(new URL(value)))) throw new CorpusError('PATH_DENIED');
  if (new Set(result.data.sources.map(item => item.document_id)).size !== result.data.sources.length) throw new CorpusError('INVALID_CORPUS');
  return result.data;
}

async function fetchAll(config: Config, stagingPath: string): Promise<void> {
  await mkdir(stagingPath, { recursive: false });
  for (const item of config.sources) await fetchOne(item.url, resolve(stagingPath, 'sources', item.file), item.sha256);
  for (const item of config.model.files) await fetchOne(item.url, resolve(stagingPath, 'model', item.file), item.sha256);
}

async function lock(candidate: z.infer<typeof candidateSchema>, outputConfig: string, stagingPath: string): Promise<Config> {
  await mkdir(stagingPath, { recursive: false });
  const sources = [];
  for (const item of candidate.sources) {
    const bytes = await download(new URL(item.url), 0);
    const destination = resolve(stagingPath, 'sources', item.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    sources.push({ ...item, sha256: sha256(bytes) });
  }
  const files = [];
  for (const item of candidate.model.files) {
    const bytes = await download(new URL(item.url), 0);
    const destination = resolve(stagingPath, 'model', item.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    files.push({ ...item, sha256: sha256(bytes) });
  }
  const config = configSchema.parse({ ...candidate, sources, model: { ...candidate.model, files } });
  await writeFile(outputConfig, canonical(config), { flag: 'wx' });
  return config;
}

async function fetchOne(url: string, destination: string, expected: string): Promise<void> {
  const bytes = await download(new URL(url), 0);
  if (sha256(bytes) !== expected) throw new CorpusError('INTEGRITY_MISMATCH');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
}

async function download(url: URL, redirects: number): Promise<Buffer> {
  if (!allowed(url) || redirects > 3) throw new CorpusError('PATH_DENIED');
  return new Promise((resolvePromise, reject) => {
    const req = request({ hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: 'GET', family: 4,
      agent: false, headers: { Accept: 'application/octet-stream,text/plain', 'Accept-Encoding': 'identity' },
      lookup(host, _options, callback) {
        lookup(host, { family: 4 }, (error, address) => {
          if (error || !publicIPv4(address)) return callback(new CorpusError('PATH_DENIED'), '', 4);
          callback(null, address, 4);
        });
      },
    }, response => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location) { reject(new CorpusError('IO_ERROR')); return; }
        download(new URL(location, url), redirects + 1).then(resolvePromise, reject);
        return;
      }
      if (status !== 200 || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.resume(); reject(new CorpusError('IO_ERROR')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_DOWNLOAD) { reject(new CorpusError('SIZE_LIMIT')); response.destroy(); } else chunks.push(chunk);
      });
      response.on('end', () => resolvePromise(Buffer.concat(chunks)));
      response.on('error', () => reject(new CorpusError('IO_ERROR')));
    });
    req.setTimeout(30000, () => req.destroy(new CorpusError('IO_ERROR')));
    req.on('error', error => reject(error instanceof CorpusError ? error : new CorpusError('IO_ERROR')));
    req.end();
  });
}

function allowed(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && url.port === '' && ALLOWED_HOSTS.has(url.hostname);
}

async function build(config: Config, stagingPath: string, outputPath: string) {
  const staging = await realpath(stagingPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(outputPath, { recursive: false });
  const modelArtifacts: CorpusArtifact[] = [];
  for (const item of config.model.files) {
    const sourceBytes = await readFile(resolve(staging, 'model', item.file));
    if (sha256(sourceBytes) !== item.sha256) throw new CorpusError('INTEGRITY_MISMATCH');
    const file = `model/${item.file}`;
    await mkdir(dirname(resolve(outputPath, file)), { recursive: true });
    await writeFile(resolve(outputPath, file), sourceBytes, { flag: 'wx' });
    modelArtifacts.push({ file, sha256: item.sha256, bytes: sourceBytes.length });
  }

  const documentManifests: CorpusDocumentManifest[] = [];
  const chunks = [];
  for (const item of config.sources) {
    const sourceBytes = await readFile(resolve(staging, 'sources', item.file));
    if (sourceBytes.length > 5 * 1024 * 1024 || sha256(sourceBytes) !== item.sha256) throw new CorpusError('INTEGRITY_MISMATCH');
    const extracted = item.format === 'pdf' ? await canonicalPdf(sourceBytes) : { text: canonicalMarkdown(sourceBytes), pages: [] };
    const canonicalText = extracted.text;
    const contentHash = sha256(canonicalText);
    const document: CorpusDocument = { schema_version: '1.0.0', document_id: item.document_id,
      canonical_uri: item.canonical_uri, publisher: item.publisher, title: item.title, protocol: item.protocol,
      chain_id: item.chain_id, deployments: item.deployments, version: item.version, commit: item.commit,
      published_at: item.published_at, retrieved_at: item.retrieved_at, license: item.license,
      access_conditions: item.access_conditions, content_hash: contentHash, parser_version: 'protocol-markdown/1.0.0',
      trust_tier: item.trust_tier, audit: item.audit, canonical_text: canonicalText };
    const bytes = Buffer.from(canonical(document));
    const file = `documents/${item.document_id}.json`;
    await mkdir(dirname(resolve(outputPath, file)), { recursive: true });
    await writeFile(resolve(outputPath, file), bytes, { flag: 'wx' });
    documentManifests.push({ document_id: item.document_id, content_hash: contentHash, file, sha256: sha256(bytes), bytes: bytes.length });
    chunks.push(...chunkDocument(item.document_id, contentHash, canonicalText, chunks.length, extracted.pages));
  }
  if (!chunks.length || chunks.length > 50000) throw new CorpusError('INVALID_CORPUS');

  const embedder = new MiniLmEmbedder(resolve(outputPath));
  const titles = new Map(config.sources.map(item => [item.document_id, item.title]));
  const vectors: number[][] = [];
  for (const chunk of chunks) vectors.push([...(await embedder.embed(`${titles.get(chunk.document_id)!}\n${chunk.excerpt}`))]);
  const chunkBytes = Buffer.from(canonical(chunks));
  const vectorBytes = Buffer.from(JSON.stringify(vectors));
  await writeFile(resolve(outputPath, 'chunks.json'), chunkBytes, { flag: 'wx' });
  await writeFile(resolve(outputPath, 'vectors.json'), vectorBytes, { flag: 'wx' });
  const body: Omit<CorpusManifest, 'corpus_snapshot_id'> = {
    schema_version: '1.0.0', created_at: config.created_at, parser_version: 'protocol-markdown/1.0.0',
    chunker_version: 'section-chunker/1.0.0', index_version: 'hybrid-rrf/1.0.0',
    embedding: { model: EMBEDDING_MODEL, revision: config.model.revision, license: config.model.license, dimension: EMBEDDING_DIMENSION,
      pooling: 'mean', normalized: true, artifacts: modelArtifacts },
    ranking: { lexical: 'bm25', vector: 'cosine', fusion: 'rrf', rrf_k: 60, lexical_weight: 1, vector_weight: 1 },
    documents: documentManifests,
    chunks: { file: 'chunks.json', sha256: sha256(chunkBytes), bytes: chunkBytes.length },
    vectors: { file: 'vectors.json', sha256: sha256(vectorBytes), bytes: vectorBytes.length },
  };
  const manifest: CorpusManifest = { ...body, corpus_snapshot_id: manifestIdentity(body) };
  await writeFile(resolve(outputPath, 'manifest.json'), canonical(manifest), { flag: 'wx' });
  const verified = await loadCorpus(outputPath);
  return { status: 'ok', corpus_snapshot_id: verified.manifest.corpus_snapshot_id,
    documents: verified.documents.size, chunks: verified.chunks.length };
}

async function canonicalPdf(bytes: Uint8Array): Promise<{ text: string; pages: { page: number; start: number; end: number }[] }> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = '';
  const pages: { page: number; start: number; end: number }[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => 'str' in item ? item.str : '').filter(Boolean).join(' ').normalize('NFC').trim();
    if (!pageText) continue;
    const start = text.length;
    text += `${pageText}\n`;
    pages.push({ page: pageNumber, start, end: text.length });
    page.cleanup();
  }
  await pdf.cleanup();
  if (!text || !pages.length) throw new CorpusError('INVALID_CORPUS');
  return { text, pages };
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ error: { code: error instanceof CorpusError || error instanceof CorpusVersionError ? error.code : 'IO_ERROR' } })}\n`);
  process.exitCode = 1;
});
