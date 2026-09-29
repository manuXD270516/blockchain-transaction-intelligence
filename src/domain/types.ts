export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };
export type Role = 'transaction' | 'receipt' | 'block';
export type ExecutionStatus = 'success' | 'reverted' | 'pending' | 'unknown';

export interface Artifact {
  role: Role;
  file: string;
  sha256: string;
  bytes: number;
}

export interface FixtureManifest {
  schema_version: '1.0.0';
  fixture_id: string;
  scenario_id: string;
  source_kind: 'synthetic';
  chain_id: string;
  description: string;
  captured_at: string;
  source: { publisher: string; uri: null; license: string };
  adapter_version: 'fixture-loader/1.0.0';
  decoder_version: null;
  corpus_snapshot: null;
  split: 'dev' | 'test';
  capabilities: {
    receipts: boolean;
    logs: boolean;
    historical_state: boolean;
    safe_finalized: boolean;
    trace: boolean;
    abi_enrichment: boolean;
  };
  snapshot: { tx_hash: string; block_hash: string | null; block_number: string | null };
  artifacts: Artifact[];
}

export interface RawPayloads {
  readonly transaction: JsonObject;
  readonly receipt: JsonObject | null;
  readonly block: JsonObject | null;
}

export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export interface LoadedFixture {
  readonly manifest: DeepReadonly<FixtureManifest>;
  readonly manifest_sha256: string;
  readonly raw: RawPayloads;
}

export interface ReplaySummary {
  schema_version: '1.0.0';
  replayer_version: 'offline-replay/1.0.0';
  replay_id: string;
  fixture_id: string;
  scenario_id: string;
  source_kind: 'synthetic';
  chain_id: string;
  snapshot: FixtureManifest['snapshot'];
  execution_status: ExecutionStatus;
  coverage: { status: 'complete' | 'partial'; scope: 'transaction-receipt-block'; missing: Role[] };
  raw_log_count: number | null;
  manifest_sha256: string;
  artifact_sha256: Record<Role, string>;
  warnings: string[];
}
