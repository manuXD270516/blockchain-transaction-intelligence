import type { Evidence, Investigation } from '../adapters/contracts.js';
import type { Json } from '../domain/types.js';
import { record } from '../adapters/contracts.js';
import { sha256 } from '../fixtures/loader.js';
import { parseJson } from '../fixtures/validation.js';

export type NormalizationCode = 'INVALID_NORMALIZATION_INPUT' | 'EVIDENCE_INTEGRITY_ERROR'
  | 'MISSING_EVIDENCE' | 'INCONSISTENT_NORMALIZATION_SNAPSHOT';
export class NormalizationError extends Error {
  constructor(public readonly code: NormalizationCode) { super(code); this.name = 'NormalizationError'; }
}
export function check(ok: boolean, code: NormalizationCode = 'INVALID_NORMALIZATION_INPUT'): asserts ok {
  if (!ok) throw new NormalizationError(code);
}

// Canonical JSON for this project's integer/string schema, not a claim of RFC 8785 compliance.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  check(typeof value === 'object' && value !== null);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export interface EvidenceNode {
  schema_version: '1.0.0';
  evidence_id: string;
  kind: 'rpc_raw' | 'fixture_materialized' | 'derived';
  content_hash: string;
  context: { chain_id: string; mode: Investigation['mode'] };
  parent_evidence_ids: string[];
  source: Evidence | null;
  transformation: string | null;
  field_sources: Record<string, string[]>;
  value: Json | null;
}
interface Captured { node: EvidenceNode; payload: Json; prefix: string }

export class EvidenceBuilder {
  readonly nodes: EvidenceNode[] = [];
  readonly #captured: Captured[] = [];
  constructor(private readonly input: Investigation) {
    for (const source of input.evidence) {
      check(source.schema_version === '1.0.0' && typeof source.raw_utf8 === 'string'
        && source.raw_utf8.length <= 2 * 1024 * 1024 && typeof source.sha256 === 'string'
        && Number.isSafeInteger(source.request_id) && source.request_id > 0 && Array.isArray(source.params)
        && typeof source.captured_at === 'string' && Number.isFinite(Date.parse(source.captured_at)));
      check(sha256(source.raw_utf8) === source.sha256, 'EVIDENCE_INTEGRITY_ERROR');
      let parsed: unknown;
      try { parsed = parseJson(Buffer.from(source.raw_utf8), 'payload'); }
      catch { throw new NormalizationError('EVIDENCE_INTEGRITY_ERROR'); }
      const isFixture = input.mode === 'synthetic';
      if (isFixture) {
        check(source.provider_id === 'fixture-loader/1.0.0'
          && ['fixture:transaction', 'fixture:receipt', 'fixture:block'].includes(source.method)
          && source.params.length === 2 && source.params.every(p => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p)));
      } else {
        check(source.provider_id === 'publicnode-sepolia' && source.method.startsWith('eth_'));
        check(record(parsed) && parsed.jsonrpc === '2.0' && parsed.id === source.request_id
          && Object.hasOwn(parsed, 'result') && !Object.hasOwn(parsed, 'error'), 'EVIDENCE_INTEGRITY_ERROR');
      }
      const payload = (isFixture ? parsed : (parsed as Record<string, Json>).result) as Json;
      const node = this.#append({ schema_version: '1.0.0', kind: isFixture ? 'fixture_materialized' : 'rpc_raw',
        content_hash: source.sha256, context: { chain_id: input.chain_id, mode: input.mode },
        parent_evidence_ids: [], source: structuredClone(source), transformation: null, field_sources: {}, value: null });
      this.#captured.push({ node, payload, prefix: isFixture ? '' : '/result' });
    }
    if (input.mode === 'testnet_live') {
      check(input.chain_id === '11155111');
      check(this.#captured.some(c => c.node.source?.method === 'eth_chainId' && c.node.source.params.length === 0
        && c.payload === '0xaa36a7'), 'MISSING_EVIDENCE');
    }
  }

  #append(node: Omit<EvidenceNode, 'evidence_id'>): EvidenceNode {
    const result = { ...node, evidence_id: sha256(canonical(node)) };
    const existing = this.nodes.find(n => n.evidence_id === result.evidence_id);
    if (existing) return existing;
    this.nodes.push(result);
    return result;
  }

  source(role: 'transaction' | 'receipt' | 'block', raw: Json): Captured {
    const matches = this.#captured.filter(c => {
      if (canonical(c.payload) !== canonical(raw)) return false;
      const source = c.node.source!;
      if (this.input.mode === 'synthetic') return source.method === `fixture:${role}`;
      if (role === 'transaction' || role === 'receipt') {
        if (source.method !== (role === 'transaction' ? 'eth_getTransactionByHash' : 'eth_getTransactionReceipt') || source.params.length !== 1) return false;
        const hash = role === 'transaction' ? (record(raw) ? raw.hash : null) : this.input.raw.transaction?.hash;
        return hash == null || source.params[0] === hash;
      }
      return source.method === 'eth_getBlockByHash' && source.params.length === 2
        && source.params[1] === false && (raw === null || (record(raw) && source.params[0] === raw.hash));
    });
    check(matches.length > 0, 'MISSING_EVIDENCE');
    return matches[0]!;
  }

  verifySnapshot(): void {
    const { snapshot, raw, mode } = this.input;
    if (snapshot === null) return;
    if (mode === 'synthetic') {
      check(snapshot.finality === 'unknown', 'INCONSISTENT_NORMALIZATION_SNAPSHOT');
      return;
    }
    const supports = (parameter: string) => this.#captured.some(c =>
      c.node.source?.method === 'eth_getBlockByNumber' && c.node.source.params.length === 2
      && c.node.source.params[0] === parameter && c.node.source.params[1] === false
      && record(c.payload) && c.payload.hash === snapshot.block_hash
      && c.payload.number === `0x${BigInt(snapshot.block_number).toString(16)}`);
    check(/^(?:0|[1-9][0-9]{0,77})$/.test(snapshot.block_number));
    if (raw.block !== null) check(supports(`0x${BigInt(snapshot.block_number).toString(16)}`), 'MISSING_EVIDENCE');
    if (snapshot.finality !== 'unknown') check(supports(snapshot.finality), 'MISSING_EVIDENCE');
  }

  derive(value: Json, parents: string[], fieldSources: Record<string, string[]>, transformation: string): string {
    check(parents.every(id => this.nodes.some(n => n.evidence_id === id)), 'MISSING_EVIDENCE');
    return this.#append({ schema_version: '1.0.0', kind: 'derived', content_hash: sha256(canonical(value)),
      context: { chain_id: this.input.chain_id, mode: this.input.mode }, parent_evidence_ids: [...new Set(parents)],
      source: null, transformation, field_sources: fieldSources, value }).evidence_id;
  }
}
