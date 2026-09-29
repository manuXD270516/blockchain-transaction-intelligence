import type { ExecutionStatus, Json, JsonObject } from '../domain/types.js';

export type AdapterCode = 'POLICY_DENIED' | 'INVALID_INPUT' | 'UNSUPPORTED_CHAIN' | 'PROVIDER_ERROR'
  | 'RATE_LIMITED' | 'TIMEOUT' | 'BUDGET_EXCEEDED' | 'UNSUPPORTED_CAPABILITY' | 'PRUNED_STATE'
  | 'INCONSISTENT_SNAPSHOT' | 'SIZE_LIMIT';
export class AdapterError extends Error {
  evidence: readonly Evidence[] = [];
  attempts: readonly Attempt[] = [];
  constructor(public readonly code: AdapterCode, public readonly retryable = false) {
    super(code);
    this.name = 'AdapterError';
  }
}
export type BlockRef = { hash: string } | { number: string } | { tag: 'latest' | 'safe' | 'finalized' };
export interface Snapshot {
  chain_id: string;
  block_hash: string;
  block_number: string;
  finality: 'unknown' | 'safe' | 'finalized';
}
export interface Evidence {
  schema_version: '1.0.0';
  provider_id: string;
  method: string;
  params: readonly Json[];
  request_id: number;
  captured_at: string;
  sha256: string;
  raw_utf8: string;
}
export interface Attempt {
  request_id: number;
  method: string;
  outcome: 'ok' | AdapterCode;
  duration_ms: number;
}
export interface Capabilities {
  receipts: boolean;
  logs: boolean;
  historical_state: 'unknown' | 'unsupported';
  safe_finalized: 'unknown' | 'unsupported';
  trace: 'unsupported';
  abi_enrichment: 'unsupported';
}
export interface Investigation {
  schema_version: '1.0.0';
  mode: 'synthetic' | 'testnet_live';
  chain_id: string;
  status: 'ok' | 'partial' | 'not_found';
  execution_status: ExecutionStatus;
  snapshot: Snapshot | null;
  raw: { transaction: JsonObject | null; receipt: JsonObject | null; block: JsonObject | null };
  capabilities: Capabilities;
  evidence: readonly Evidence[];
  attempts: readonly Attempt[];
  warnings: readonly string[];
}
export interface ChainAdapter {
  investigate(txHash: string): Promise<Investigation>;
}
export interface BlockRead<T> {
  schema_version: '1.0.0';
  data: T;
  snapshot: Snapshot;
  evidence: readonly Evidence[];
  attempts: readonly Attempt[];
}
export const HASH = /^0x[0-9a-f]{64}$/;
export const ADDRESS = /^0x[0-9a-f]{40}$/;
export const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
export function record(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function match(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
export function requireInput(ok: boolean): asserts ok {
  if (!ok) throw new AdapterError('INVALID_INPUT');
}
export function requireData(ok: boolean): asserts ok {
  if (!ok) throw new AdapterError('PROVIDER_ERROR');
}
export function consistent(ok: boolean): asserts ok {
  if (!ok) throw new AdapterError('INCONSISTENT_SNAPSHOT');
}
