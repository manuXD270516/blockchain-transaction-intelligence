import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as z from 'zod';
import { CorpusError } from './errors.js';
import { loadCorpus } from './loader.js';
import type { LoadedCorpus } from './types.js';
import { parseCorpusJson } from './validation.js';

export const REGISTRY_FILE = 'index.json';
const HEX64 = /^[0-9a-f]{64}$/;
const PATH = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const documentEntry = z.strictObject({ document_id: z.string().min(1).max(100), canonical_uri: z.string().min(1).max(2000),
  content_hash: z.string().regex(HEX64), version: z.string().max(100).nullable() });
const snapshotEntry = z.strictObject({ corpus_snapshot_id: z.string().regex(HEX64), path: z.string().regex(PATH),
  created_at: z.string().datetime(), documents: z.array(documentEntry).min(1).max(128),
  changes: z.strictObject({ added: z.array(z.string()), removed: z.array(z.string()), new_version: z.array(z.string()) }) });
const registrySchema = z.strictObject({ schema_version: z.literal('1.0.0'), snapshots: z.array(snapshotEntry).max(1000) });
export type CorpusRegistry = z.infer<typeof registrySchema>;

export class CorpusVersionError extends Error {
  constructor(readonly code: 'INVALID_REGISTRY' | 'SNAPSHOT_ALREADY_REGISTERED' | 'INVALID_SNAPSHOT_PATH'
    | 'CITATION_SNAPSHOT_NOT_FOUND' | 'CITATION_NOT_FOUND') { super(code); this.name = 'CorpusVersionError'; }
}

export function emptyRegistry(): CorpusRegistry { return { schema_version: '1.0.0', snapshots: [] }; }

export function validateRegistry(value: unknown): CorpusRegistry {
  const parsed = registrySchema.safeParse(value);
  if (!parsed.success) throw new CorpusVersionError('INVALID_REGISTRY');
  const ids = parsed.data.snapshots.map(item => item.corpus_snapshot_id);
  const paths = parsed.data.snapshots.map(item => item.path);
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) throw new CorpusVersionError('INVALID_REGISTRY');
  return parsed.data;
}

export async function readRegistry(snapshotsRoot: string): Promise<CorpusRegistry> {
  try { return validateRegistry(parseCorpusJson(await readFile(resolve(snapshotsRoot, REGISTRY_FILE)))); }
  catch (error) {
    if (error instanceof CorpusVersionError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry();
    throw new CorpusVersionError('INVALID_REGISTRY');
  }
}

/** Append-only: returns a new registry with `corpus` registered at `path`, never rewriting earlier versions. */
export function registerSnapshot(registry: CorpusRegistry, corpus: LoadedCorpus, path: string): CorpusRegistry {
  const current = validateRegistry(registry);
  if (!PATH.test(path)) throw new CorpusVersionError('INVALID_SNAPSHOT_PATH');
  const id = corpus.manifest.corpus_snapshot_id;
  if (current.snapshots.some(item => item.corpus_snapshot_id === id || item.path === path)) {
    throw new CorpusVersionError('SNAPSHOT_ALREADY_REGISTERED');
  }
  const documents = [...corpus.documents.values()].map(document => ({ document_id: document.document_id,
    canonical_uri: document.canonical_uri, content_hash: document.content_hash, version: document.version }))
    .sort((a, b) => a.canonical_uri.localeCompare(b.canonical_uri));
  const previous = new Map((current.snapshots.at(-1)?.documents ?? []).map(item => [item.canonical_uri, item]));
  const next = new Set(documents.map(item => item.canonical_uri));
  const changes = {
    added: documents.filter(item => !previous.has(item.canonical_uri)).map(item => item.canonical_uri),
    removed: [...previous.keys()].filter(uri => !next.has(uri)).sort(),
    new_version: documents.filter(item => previous.has(item.canonical_uri)
      && previous.get(item.canonical_uri)!.content_hash !== item.content_hash).map(item => item.canonical_uri),
  };
  return { schema_version: '1.0.0', snapshots: [...current.snapshots,
    { corpus_snapshot_id: id, path, created_at: corpus.manifest.created_at, documents, changes }] };
}

export interface ResolvedCitation {
  corpus_snapshot_id: string;
  chunk_id: string;
  document_id: string;
  canonical_uri: string;
  document_version: string | null;
  content_hash: string;
  start: number;
  end: number;
  page: number | null;
  excerpt: string;
}

/** Resolves a citation against the exact snapshot it was made from, re-verifying that snapshot's integrity. */
export async function resolveCitation(snapshotsRoot: string, registry: CorpusRegistry,
  citation: { corpus_snapshot_id: string; chunk_id: string }): Promise<ResolvedCitation> {
  const entry = validateRegistry(registry).snapshots.find(item => item.corpus_snapshot_id === citation.corpus_snapshot_id);
  if (!entry) throw new CorpusVersionError('CITATION_SNAPSHOT_NOT_FOUND');
  const corpus = await loadCorpus(resolve(snapshotsRoot, entry.path));
  if (corpus.manifest.corpus_snapshot_id !== entry.corpus_snapshot_id) throw new CorpusError('INTEGRITY_MISMATCH');
  const chunk = corpus.chunks.find(item => item.chunk_id === citation.chunk_id);
  if (!chunk) throw new CorpusVersionError('CITATION_NOT_FOUND');
  const document = corpus.documents.get(chunk.document_id)!;
  return { corpus_snapshot_id: entry.corpus_snapshot_id, chunk_id: chunk.chunk_id, document_id: document.document_id,
    canonical_uri: document.canonical_uri, document_version: document.version, content_hash: document.content_hash,
    start: chunk.start, end: chunk.end, page: chunk.page, excerpt: chunk.excerpt };
}
