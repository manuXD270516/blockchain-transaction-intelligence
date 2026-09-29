export const CORPUS_SCHEMA_VERSION = '1.0.0' as const;
export const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2' as const;
export const EMBEDDING_DIMENSION = 384;

export type Compatibility = 'matched' | 'generic' | 'unknown' | 'conflicting';

export interface CorpusArtifact {
  file: string;
  sha256: string;
  bytes: number;
}

export interface CorpusDocumentManifest extends CorpusArtifact {
  document_id: string;
  content_hash: string;
}

export interface CorpusManifest {
  schema_version: typeof CORPUS_SCHEMA_VERSION;
  corpus_snapshot_id: string;
  created_at: string;
  parser_version: 'protocol-markdown/1.0.0';
  chunker_version: 'section-chunker/1.0.0';
  index_version: 'hybrid-rrf/1.0.0';
  embedding: {
    model: typeof EMBEDDING_MODEL;
    revision: string;
    license: 'Apache-2.0';
    dimension: typeof EMBEDDING_DIMENSION;
    pooling: 'mean';
    normalized: true;
    artifacts: CorpusArtifact[];
  };
  ranking: { lexical: 'bm25'; vector: 'cosine'; fusion: 'rrf'; rrf_k: 60; lexical_weight: 1; vector_weight: 1 };
  documents: CorpusDocumentManifest[];
  chunks: CorpusArtifact;
  vectors: CorpusArtifact;
}

export interface CorpusDocument {
  schema_version: typeof CORPUS_SCHEMA_VERSION;
  document_id: string;
  canonical_uri: string;
  publisher: string;
  title: string;
  protocol: string;
  chain_id: string | null;
  deployments: string[];
  version: string | null;
  commit: string;
  published_at: string | null;
  retrieved_at: string;
  license: string;
  access_conditions: string;
  content_hash: string;
  parser_version: CorpusManifest['parser_version'];
  trust_tier: 'normative' | 'publisher' | 'audit';
  audit: null | { auditor: string; contract: string; commit: string; date: string; scope: string };
  canonical_text: string;
}

export interface CorpusChunk {
  schema_version: typeof CORPUS_SCHEMA_VERSION;
  chunk_id: string;
  document_id: string;
  document_hash: string;
  heading_path: string[];
  start: number;
  end: number;
  page: number | null;
  excerpt: string;
  chunk_hash: string;
  embedding_index: number;
}

export interface LoadedCorpus {
  root: string;
  manifest: CorpusManifest;
  manifest_hash: string;
  documents: ReadonlyMap<string, CorpusDocument>;
  chunks: readonly CorpusChunk[];
  vectors: readonly (readonly number[])[];
}

export interface ProtocolSearchInput {
  query: string;
  chain_id?: string;
  protocol?: string;
  version?: string;
  top_k: number;
}

export interface ProtocolSearchHit {
  chunk_id: string;
  document_id: string;
  document_hash: string;
  excerpt: string;
  span: { start: number; end: number };
  uri: string;
  title: string;
  protocol: string;
  version: string | null;
  commit: string;
  heading: string[];
  page: number | null;
  score: number;
  compatibility: Compatibility;
  index_version: string;
  corpus_snapshot_id: string;
}

export interface ProtocolSearchResult {
  hits: ProtocolSearchHit[];
  corpus_snapshot_id: string;
  manifest_hash: string;
  created_at: string;
  index_version: string;
  branches: ('bm25' | 'vector')[];
  candidates: number;
}

export interface ProtocolSearch {
  search(input: ProtocolSearchInput): Promise<ProtocolSearchResult>;
}
