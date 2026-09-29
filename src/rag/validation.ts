import * as z from 'zod';
import { canonical } from '../normalization/evidence.js';
import { sha256 } from '../fixtures/loader.js';
import { CorpusError } from './errors.js';
import { CORPUS_SCHEMA_VERSION, EMBEDDING_DIMENSION, EMBEDDING_MODEL } from './types.js';
import type { CorpusChunk, CorpusDocument, CorpusManifest } from './types.js';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const relativeFile = z.string().min(1).max(240).regex(/^(?![./\\])(?!(?:.*[\\/])?\.\.(?:[\\/]|$))[a-zA-Z0-9._/-]+$/);
const artifact = z.strictObject({ file: relativeFile, sha256: digest, bytes: z.number().int().nonnegative().max(64 * 1024 * 1024) });
const manifestSchema = z.strictObject({
  schema_version: z.literal(CORPUS_SCHEMA_VERSION),
  corpus_snapshot_id: digest,
  created_at: z.iso.datetime(),
  parser_version: z.literal('protocol-markdown/1.0.0'),
  chunker_version: z.literal('section-chunker/1.0.0'),
  index_version: z.literal('hybrid-rrf/1.0.0'),
  embedding: z.strictObject({
    model: z.literal(EMBEDDING_MODEL), revision: z.string().min(1).max(100), license: z.literal('Apache-2.0'),
    dimension: z.literal(EMBEDDING_DIMENSION),
    pooling: z.literal('mean'), normalized: z.literal(true), artifacts: z.array(artifact).min(1).max(20),
  }),
  ranking: z.strictObject({ lexical: z.literal('bm25'), vector: z.literal('cosine'), fusion: z.literal('rrf'),
    rrf_k: z.literal(60), lexical_weight: z.literal(1), vector_weight: z.literal(1) }),
  documents: z.array(artifact.extend({ document_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/), content_hash: digest })).min(1).max(128),
  chunks: artifact,
  vectors: artifact,
});

const documentSchema = z.strictObject({
  schema_version: z.literal(CORPUS_SCHEMA_VERSION),
  document_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  canonical_uri: z.url().max(2048),
  publisher: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  protocol: z.string().min(1).max(100),
  chain_id: z.union([z.string().regex(/^[1-9][0-9]*$/), z.null()]),
  deployments: z.array(z.string().regex(/^0x[0-9a-f]{40}$/)).max(100),
  version: z.union([z.string().min(1).max(100), z.null()]),
  commit: z.string().min(7).max(64).regex(/^[0-9a-f]+$/),
  published_at: z.union([z.iso.datetime(), z.null()]),
  retrieved_at: z.iso.datetime(),
  license: z.string().min(1).max(100),
  access_conditions: z.string().min(1).max(300),
  content_hash: digest,
  parser_version: z.literal('protocol-markdown/1.0.0'),
  trust_tier: z.enum(['normative', 'publisher', 'audit']),
  audit: z.union([z.null(), z.strictObject({ auditor: z.string().min(1).max(200), contract: z.string().min(1).max(200),
    commit: z.string().min(7).max(64).regex(/^[0-9a-f]+$/), date: z.iso.date(), scope: z.string().min(1).max(1000) })]),
  canonical_text: z.string().min(1).max(5 * 1024 * 1024),
});

const chunkSchema = z.strictObject({
  schema_version: z.literal(CORPUS_SCHEMA_VERSION),
  chunk_id: digest,
  document_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  document_hash: digest,
  heading_path: z.array(z.string().min(1).max(300)).max(20),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  page: z.union([z.number().int().positive(), z.null()]),
  excerpt: z.string().min(1).max(128 * 1024),
  chunk_hash: digest,
  embedding_index: z.number().int().nonnegative().max(49999),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CorpusError('INVALID_CORPUS');
  return result.data;
}

export function validateManifest(value: unknown): CorpusManifest {
  const manifest = parse(manifestSchema, value);
  if (manifest.corpus_snapshot_id !== manifestIdentity(manifest)) throw new CorpusError('INTEGRITY_MISMATCH');
  const files = [...manifest.documents, manifest.chunks, manifest.vectors, ...manifest.embedding.artifacts].map(item => item.file);
  if (new Set(files).size !== files.length || new Set(manifest.documents.map(item => item.document_id)).size !== manifest.documents.length) {
    throw new CorpusError('INVALID_CORPUS');
  }
  if (!manifest.embedding.artifacts.every(item => item.file.startsWith('model/'))) throw new CorpusError('INVALID_CORPUS');
  return manifest;
}

export function validateDocument(value: unknown): CorpusDocument {
  const document = parse(documentSchema, value);
  if (sha256(document.canonical_text) !== document.content_hash) throw new CorpusError('INTEGRITY_MISMATCH');
  if ((document.trust_tier === 'audit') !== (document.audit !== null)) throw new CorpusError('INVALID_CORPUS');
  return document;
}

export function validateChunks(value: unknown): CorpusChunk[] {
  if (!Array.isArray(value) || value.length > 50000) throw new CorpusError('INVALID_CORPUS');
  return value.map(item => parse(chunkSchema, item));
}

export function validateVectors(value: unknown, expected: number): number[][] {
  if (!Array.isArray(value) || value.length !== expected) throw new CorpusError('INVALID_CORPUS');
  return value.map(vector => {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION
      || !vector.every(item => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 1.000001)) {
      throw new CorpusError('INVALID_CORPUS');
    }
    const norm = Math.sqrt(vector.reduce((sum, item) => sum + (item as number) ** 2, 0));
    if (Math.abs(norm - 1) > 0.001) throw new CorpusError('INVALID_CORPUS');
    return vector as number[];
  });
}

export function parseCorpusJson(bytes: Uint8Array): unknown {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.depth > 64 || typeof item.value === 'number' && (!Number.isFinite(item.value) || Math.abs(item.value) > Number.MAX_SAFE_INTEGER)) {
        throw new Error();
      }
      if (item.value !== null && typeof item.value === 'object') {
        for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
      }
    }
    return value;
  } catch {
    throw new CorpusError('INVALID_CORPUS');
  }
}

export function manifestIdentity(manifest: Omit<CorpusManifest, 'corpus_snapshot_id'> | CorpusManifest): string {
  const { corpus_snapshot_id: _, ...body } = manifest as CorpusManifest;
  return sha256(canonical(body));
}
