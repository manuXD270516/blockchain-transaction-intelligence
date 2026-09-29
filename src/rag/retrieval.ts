import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MiniLmEmbedder } from './embedder.js';
import type { Embedder } from './embedder.js';
import { loadCorpus } from './loader.js';
import type { Compatibility, LoadedCorpus, ProtocolSearch, ProtocolSearchHit, ProtocolSearchInput, ProtocolSearchResult } from './types.js';

const DEFAULT_CORPUS = fileURLToPath(new URL('../../corpus/snapshots/m5-v1/', import.meta.url));
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const VECTOR_MINIMUM = 0.45;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'de', 'del', 'el', 'en', 'es', 'for', 'how', 'la', 'las', 'los',
  'of', 'on', 'or', 'que', 'the', 'to', 'un', 'una', 'what', 'with', 'y']);

export class HybridProtocolSearch implements ProtocolSearch {
  private corpus?: Promise<LoadedCorpus>;
  private embedder: Embedder | undefined;
  constructor(private readonly root = DEFAULT_CORPUS, embedder?: Embedder) { this.embedder = embedder; }

  async search(input: ProtocolSearchInput): Promise<ProtocolSearchResult> {
    const corpus = await (this.corpus ??= loadCorpus(this.root));
    this.embedder ??= new MiniLmEmbedder(corpus.root);
    const queryVector = await this.embedder.embed(input.query);
    const queryTokens = tokenize(input.query);
    const candidates = corpus.chunks.map((chunk, index) => ({ chunk, index, document: corpus.documents.get(chunk.document_id)! }))
      .filter(item => (!input.protocol || item.document.protocol.toLowerCase() === input.protocol.toLowerCase())
        && (!input.chain_id || item.document.chain_id === null || item.document.chain_id === input.chain_id));

    const lexicalTexts = candidates.map(item => `${item.document.title} ${item.document.title} ${item.chunk.excerpt}`);
    const lexical = bm25(queryTokens, lexicalTexts);
    const vector = candidates.map(item => cosine(queryVector, corpus.vectors[item.index]!));
    const minimumMatches = Math.min(2, new Set(queryTokens).size);
    const lexicalRank = rank(lexical, (score, index) => score > 0
      && overlap(queryTokens, tokenize(lexicalTexts[index]!)) >= minimumMatches);
    const vectorRank = rank(vector, score => score >= VECTOR_MINIMUM);
    const fused = new Map<number, number>();
    for (const [index, position] of lexicalRank) fused.set(index, (fused.get(index) ?? 0) + 1 / (60 + position));
    for (const [index, position] of vectorRank) fused.set(index, (fused.get(index) ?? 0) + 1 / (60 + position));

    const ranked = [...fused].sort((a, b) => versionPriority(candidates[a[0]]!.document.version, input.version)
      - versionPriority(candidates[b[0]]!.document.version, input.version) || b[1] - a[1]
      || candidates[a[0]]!.chunk.chunk_id.localeCompare(candidates[b[0]]!.chunk.chunk_id));
    const counts = new Map<string, number>();
    const ordered: [number, number][] = [];
    for (const item of ranked) {
      const documentId = candidates[item[0]]!.document.document_id;
      const count = counts.get(documentId) ?? 0;
      if (count >= 2) continue;
      counts.set(documentId, count + 1);
      ordered.push(item);
      if (ordered.length === input.top_k) break;
    }
    const hits: ProtocolSearchHit[] = ordered.map(([candidateIndex, score]) => {
      const item = candidates[candidateIndex]!;
      return {
        chunk_id: item.chunk.chunk_id,
        document_id: item.document.document_id,
        document_hash: item.document.content_hash,
        excerpt: item.chunk.excerpt,
        span: { start: item.chunk.start, end: item.chunk.end },
        uri: item.document.canonical_uri,
        title: item.document.title,
        protocol: item.document.protocol,
        version: item.document.version,
        commit: item.document.commit,
        heading: item.chunk.heading_path,
        page: item.chunk.page,
        score: Number(score.toFixed(12)),
        compatibility: compatibility(item.document.version, input.version),
        index_version: corpus.manifest.index_version,
        corpus_snapshot_id: corpus.manifest.corpus_snapshot_id,
      };
    });
    return { hits, corpus_snapshot_id: corpus.manifest.corpus_snapshot_id, manifest_hash: corpus.manifest_hash,
      created_at: corpus.manifest.created_at,
      index_version: corpus.manifest.index_version, branches: [
        ...(lexicalRank.size ? ['bm25' as const] : []), ...(vectorRank.size ? ['vector' as const] : []),
      ], candidates: candidates.length };
  }
}

function tokenize(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []).filter(token => !STOP_WORDS.has(token));
}

function bm25(query: readonly string[], documents: readonly string[]): number[] {
  if (!query.length || !documents.length) return documents.map(() => 0);
  const tokenized = documents.map(tokenize);
  const averageLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;
  const terms = [...new Set(query)];
  const frequencies = new Map<string, number>();
  for (const term of terms) frequencies.set(term, tokenized.filter(tokens => tokens.includes(term)).length);
  return tokenized.map(tokens => {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return terms.reduce((sum, term) => {
      const tf = counts.get(term) ?? 0;
      if (!tf) return sum;
      const df = frequencies.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      return sum + idf * tf * (BM25_K1 + 1) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * tokens.length / averageLength));
    }, 0);
  });
}

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return -1;
  let value = 0;
  for (let index = 0; index < a.length; index++) value += a[index]! * b[index]!;
  return value;
}

function rank(scores: readonly number[], include: (score: number, index: number) => boolean): Map<number, number> {
  const ordered = scores.map((score, index) => ({ score, index })).filter(item => include(item.score, item.index))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return new Map(ordered.map((item, index) => [item.index, index + 1]));
}

function overlap(query: readonly string[], document: readonly string[]): number {
  const terms = new Set(document);
  return new Set(query.filter(term => terms.has(term))).size;
}

function compatibility(documentVersion: string | null, requestedVersion?: string): Compatibility {
  if (requestedVersion === undefined) return documentVersion === null ? 'generic' : 'unknown';
  if (documentVersion === null) return 'generic';
  return documentVersion.toLowerCase() === requestedVersion.toLowerCase() ? 'matched' : 'conflicting';
}

function versionPriority(documentVersion: string | null, requestedVersion?: string): number {
  if (requestedVersion === undefined) return 0;
  if (documentVersion?.toLowerCase() === requestedVersion.toLowerCase()) return 0;
  return documentVersion === null ? 1 : 2;
}

export function defaultCorpusRoot(): string { return resolve(DEFAULT_CORPUS); }
