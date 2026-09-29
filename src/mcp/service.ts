import { randomBytes, randomUUID } from 'node:crypto';
import type { Json, JsonObject } from '../domain/types.js';
import { AdapterError, ADDRESS, HASH } from '../adapters/contracts.js';
import type { BlockRead, BlockRef, Evidence, Investigation, Snapshot } from '../adapters/contracts.js';
import { EthereumAdapter, SEPOLIA_CHAIN_ID } from '../adapters/ethereum.js';
import { sha256 } from '../fixtures/loader.js';
import { normalizeInvestigation } from '../normalization/normalize.js';
import { extractTokenEvents } from '../events/extract.js';
import { decodeStandardEvent } from '../events/decode.js';
import { canonical } from '../normalization/evidence.js';
import { CorpusError } from '../rag/errors.js';
import { HybridProtocolSearch } from '../rag/retrieval.js';
import type { ProtocolSearch } from '../rag/types.js';
import { CursorCodec, CursorError } from './cursor.js';

export const TOOL_NAMES = ['get_transaction', 'get_receipt', 'get_block', 'get_wallet_balance', 'get_token_transfers',
  'get_contract', 'get_contract_events', 'trace_transaction', 'search_protocol_docs'] as const;
export type ToolName = typeof TOOL_NAMES[number];
export const PUBLIC_ERROR_CODES = ['UNSUPPORTED_CHAIN', 'INVALID_INPUT', 'INVALID_CURSOR', 'POLICY_DENIED',
  'RATE_LIMITED', 'TIMEOUT', 'PROVIDER_ERROR', 'INCONSISTENT_SNAPSHOT', 'BUDGET_EXCEEDED'] as const;
type PublicErrorCode = typeof PUBLIC_ERROR_CODES[number];
export interface McpBackend {
  investigate(hash: string): Promise<Investigation>;
  getBlock(ref: BlockRef): Promise<BlockRead<JsonObject>>;
  getBalance(address: string, ref: BlockRef): Promise<BlockRead<Json>>;
  getCode(address: string, ref: BlockRef): Promise<BlockRead<Json>>;
  getLogs(address: string, ref: BlockRef): Promise<BlockRead<Json>>;
}
export type ToolResult = { content: [{ type: 'text'; text: string }]; structuredContent: Record<string, unknown>; isError?: boolean };
const MAX_RESPONSE = 2 * 1024 * 1024;

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every(k => keys.includes(k)); }
function chain(value: unknown): void {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new AdapterError('INVALID_INPUT');
  if (value !== SEPOLIA_CHAIN_ID) throw new AdapterError('UNSUPPORTED_CHAIN');
}
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !HASH.test(value)) throw new AdapterError('INVALID_INPUT'); }
function address(value: unknown): asserts value is string { if (typeof value !== 'string' || !ADDRESS.test(value)) throw new AdapterError('INVALID_INPUT'); }
function blockRef(value: unknown): BlockRef {
  if (!object(value) || Object.keys(value).length !== 1) throw new AdapterError('INVALID_INPUT');
  if (typeof value.hash === 'string' && HASH.test(value.hash)) return { hash: value.hash };
  if (typeof value.number === 'string' && /^(?:0|[1-9][0-9]{0,77})$/.test(value.number)) return { number: value.number };
  if (value.tag === 'latest' || value.tag === 'safe' || value.tag === 'finalized') return { tag: value.tag };
  throw new AdapterError('INVALID_INPUT');
}
function evidenceIds(items: readonly Evidence[]): string[] { return [...new Set(items.map(v => v.sha256))]; }
function observed(items: readonly Evidence[]): string { return items.at(-1)?.captured_at ?? new Date(0).toISOString(); }
function snapshot(value: Snapshot | null, evidence: readonly Evidence[]) {
  return value === null ? null : { ...value, observed_at: observed(evidence) };
}
function provenance(items: readonly Evidence[], mode: Investigation['mode'] | 'testnet_live' = 'testnet_live') {
  return { adapter: mode === 'synthetic' ? 'fixture-loader' : 'ethereum-sepolia', version: '1.0.0',
    fetched_at: observed(items), raw_content_hash: items.length ? sha256(canonical(items.map(v => v.sha256))) : null };
}
function envelope(status: 'ok' | 'partial' | 'not_found' | 'unavailable', data: unknown, evidence: readonly Evidence[], snap: Snapshot | null,
  coverage: { scope: string; complete: boolean; missing?: string[]; truncated?: boolean; snapshot_manifest_hash?: string; [key: string]: unknown },
  warnings: readonly string[], page: { next_cursor: string | null } | null,
  mode: Investigation['mode'] | 'testnet_live' = 'testnet_live', extraEvidenceIds: readonly string[] = []) {
  return { schema_version: '1.0.0', request_id: randomUUID(), status, data,
    evidence_ids: [...new Set([...evidenceIds(evidence), ...extraEvidenceIds])],
    snapshot: snapshot(snap, evidence), provenance: provenance(evidence, mode),
    coverage: { missing: [], truncated: false, ...coverage }, warnings: [...new Set(warnings)].sort(), page };
}

export class BlockchainMcpService {
  private readonly cursors: CursorCodec;
  constructor(private readonly backend: McpBackend = new EthereumAdapter(), secret: Uint8Array = randomBytes(32),
    private readonly requestId = randomUUID, private readonly documents: ProtocolSearch = new HybridProtocolSearch()) {
    this.cursors = new CursorCodec(secret);
  }

  async call(name: string, raw: unknown): Promise<ToolResult> {
    const id = this.requestId();
    try {
      if (!TOOL_NAMES.includes(name as ToolName)) throw new AdapterError('INVALID_INPUT');
      if (!object(raw)) throw new AdapterError('INVALID_INPUT');
      const result = await this.dispatch(name as ToolName, raw);
      result.request_id = id;
      const text = JSON.stringify(result);
      if (Buffer.byteLength(text) > MAX_RESPONSE) throw new AdapterError('SIZE_LIMIT');
      return { content: [{ type: 'text', text }], structuredContent: result };
    } catch (error) {
      if (error instanceof AdapterError && (error.code === 'UNSUPPORTED_CAPABILITY' || error.code === 'PRUNED_STATE')) {
        const result = envelope('unavailable', null, error.evidence, null,
          { scope: TOOL_NAMES.includes(name as ToolName) ? name : 'unknown', complete: false, missing: [error.code] },
          [error.code], null);
        result.request_id = id;
        const text = JSON.stringify(result);
        return { content: [{ type: 'text', text }], structuredContent: result };
      }
      const code = publicErrorCode(error);
      const body = { schema_version: '1.0.0', request_id: id, error: { code,
        message: publicErrorMessage(code),
        retryable: error instanceof AdapterError && error.retryable }, evidence_ids: error instanceof AdapterError ? evidenceIds(error.evidence) : [] };
      return { content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body, isError: true };
    }
  }

  private async dispatch(name: ToolName, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === 'search_protocol_docs') {
      if (!exact(input, ['query', 'chain_id', 'protocol', 'version', 'top_k']) || typeof input.query !== 'string'
        || input.query.length < 1 || input.query.length > 2000) throw new AdapterError('INVALID_INPUT');
      if (input.chain_id !== undefined) chain(input.chain_id);
      for (const key of ['protocol', 'version'] as const) {
        if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length < 1 || input[key].length > 100)) {
          throw new AdapterError('INVALID_INPUT');
        }
      }
      if (input.top_k !== undefined && (!Number.isInteger(input.top_k) || (input.top_k as number) < 1 || (input.top_k as number) > 10)) {
        throw new AdapterError('INVALID_INPUT');
      }
      try {
        const result = await this.documents.search({ query: input.query, top_k: (input.top_k as number | undefined) ?? 5,
          ...(input.chain_id === undefined ? {} : { chain_id: input.chain_id as string }),
          ...(input.protocol === undefined ? {} : { protocol: input.protocol as string }),
          ...(input.version === undefined ? {} : { version: input.version as string }) });
        const empty = result.hits.length === 0;
        const response = envelope('ok', result.hits, [], null, { scope: 'approved-versioned-protocol-corpus',
          complete: !empty, missing: empty ? ['relevant_documents'] : [], truncated: result.candidates > result.hits.length,
          corpus_snapshot_id: result.corpus_snapshot_id, index_version: result.index_version,
          branches: result.branches, candidates: result.candidates }, empty ? ['NO_RELEVANT_DOCUMENTS'] : [], null,
          'testnet_live', result.hits.map(hit => hit.chunk_id));
        response.provenance = { adapter: 'protocol-corpus', version: result.index_version,
          fetched_at: result.created_at, raw_content_hash: result.manifest_hash };
        return response;
      } catch (error) {
        if (!(error instanceof CorpusError)) throw error;
        return envelope('unavailable', null, [], null, { scope: 'protocol-corpus', complete: false, missing: ['corpus'] },
          ['CORPUS_NOT_CONFIGURED'], null);
      }
    }
    if (!exact(input, allowed(name))) throw new AdapterError('INVALID_INPUT');
    chain(input.chain_id);
    if (name === 'trace_transaction') {
      hash(input.tx_hash);
      return envelope('unavailable', null, [], null, { scope: 'call-trace', complete: false, missing: ['trace'] }, ['UNSUPPORTED_CAPABILITY'], null);
    }
    if (name === 'get_transaction' || name === 'get_receipt' || name === 'get_token_transfers') {
      hash(input.tx_hash);
      const requestedPageLimit = name === 'get_token_transfers' ? pageLimit(input) : null;
      const investigation = await this.backend.investigate(input.tx_hash);
      if (investigation.chain_id !== SEPOLIA_CHAIN_ID) throw new AdapterError('INCONSISTENT_SNAPSHOT');
      if (name === 'get_transaction') {
        const normalized = normalizeInvestigation(investigation);
        return envelope(investigation.status === 'not_found' ? 'not_found' : investigation.status, normalized.transaction,
          investigation.evidence, investigation.snapshot, { scope: 'transaction', complete: investigation.raw.transaction !== null,
            missing: investigation.raw.transaction === null ? ['transaction'] : [] }, investigation.warnings, null, investigation.mode,
          normalized.evidence.map(value => value.evidence_id));
      }
      if (name === 'get_receipt') {
        const normalized = normalizeInvestigation(investigation); const available = normalized.receipt !== null;
        return envelope(available ? investigation.status : investigation.status === 'not_found' ? 'not_found' : 'unavailable', normalized.receipt,
          investigation.evidence, investigation.snapshot, { scope: 'receipt', complete: available, missing: available ? [] : ['receipt'] },
          available ? investigation.warnings : [...investigation.warnings, 'RECEIPT_NOT_AVAILABLE'], null, investigation.mode,
          normalized.evidence.map(value => value.evidence_id));
      }
      const extracted = extractTokenEvents(investigation);
      const query = sha256(extracted.extraction_id); const limit = requestedPageLimit!; const offset = input.cursor === undefined ? 0
        : this.cursors.decode(input.cursor as string, name, query);
      if (offset > extracted.transfers.length) throw new CursorError();
      const transfers = extracted.transfers.slice(offset, offset + limit); const more = offset + transfers.length < extracted.transfers.length;
      return envelope(investigation.status === 'not_found' ? 'not_found' : more || extracted.coverage.status !== 'complete' ? 'partial' : 'ok',
        transfers, investigation.evidence, investigation.snapshot, { scope: 'transaction-standard-token-events',
          complete: !more && extracted.coverage.status === 'complete', missing: extracted.coverage.receipt_available ? [] : ['receipt'],
          truncated: more || extracted.coverage.omitted_logs > 0 }, extracted.warnings,
        { next_cursor: more ? this.cursors.encode(name, query, offset + transfers.length) : null }, investigation.mode,
        [...extracted.normalized.evidence, ...extracted.derived_evidence].map(value => value.evidence_id));
    }
    if (name === 'get_block') {
      const read = await this.backend.getBlock(blockRef(input.block));
      const transactions = read.data.transactions as Json[]; const truncated = transactions.length > 10000;
      const data = truncated ? { ...read.data, transactions: transactions.slice(0, 10000) } : read.data;
      return envelope(truncated ? 'partial' : 'ok', data, read.evidence, read.snapshot,
        { scope: 'block-header-and-transaction-hashes', complete: !truncated, truncated }, truncated ? ['BLOCK_TRANSACTIONS_TRUNCATED'] : [], null);
    }
    if (name === 'get_wallet_balance') {
      address(input.address); const read = await this.backend.getBalance(input.address, blockRef(input.block));
      return envelope('ok', { asset: 'native', raw_balance_wei: BigInt(read.data as string).toString() }, read.evidence, read.snapshot,
        { scope: 'native-balance-at-snapshot', complete: true }, ['TOKEN_BALANCES_NOT_INCLUDED', 'FIAT_VALUE_NOT_INCLUDED'], null);
    }
    if (name === 'get_contract') {
      address(input.address); const read = await this.backend.getCode(input.address, blockRef(input.block)); const bytecode = read.data as string;
      return envelope('ok', { address: input.address, bytecode, bytecode_sha256: sha256(bytecode), abi: null, source: null,
        proxy: null, implementation: null }, read.evidence, read.snapshot, { scope: 'bytecode-at-snapshot', complete: true,
        missing: ['abi', 'source', 'proxy_resolution'] }, ['CONTRACT_IDENTITY_NOT_INFERRED'], null);
    }
    return this.contractEvents(input);
  }

  private async contractEvents(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    address(input.address);
    if (typeof input.from_block !== 'string' || typeof input.to_block !== 'string'
      || !/^(?:0|[1-9][0-9]{0,77})$/.test(input.from_block) || !/^(?:0|[1-9][0-9]{0,77})$/.test(input.to_block)) throw new AdapterError('INVALID_INPUT');
    const from = BigInt(input.from_block); const to = BigInt(input.to_block);
    if (to < from || to - from >= 100n) throw new AdapterError('INVALID_INPUT');
    if (input.topics !== undefined && (!Array.isArray(input.topics) || input.topics.length > 4
      || !input.topics.every(v => v === null || typeof v === 'string' && HASH.test(v)))) throw new AdapterError('INVALID_INPUT');
    const limit = input.limit === undefined ? 50 : input.limit;
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100 || (input.cursor !== undefined && typeof input.cursor !== 'string')) throw new AdapterError('INVALID_INPUT');
    const all: JsonObject[] = []; const evidence: Evidence[] = []; let snap: Snapshot | null = null;
    const snapshots: { block_number: string; block_hash: string }[] = [];
    for (let block = from; block <= to; block++) {
      const read = await this.backend.getLogs(input.address, { number: block.toString() }); snap = read.snapshot;
      snapshots.push({ block_number: read.snapshot.block_number, block_hash: read.snapshot.block_hash }); evidence.push(...read.evidence);
      for (const log of read.data as JsonObject[]) {
        const wanted = input.topics as (string | null)[] | undefined;
        if (!wanted || wanted.every((topic, index) => topic === null || (log.topics as Json[])[index] === topic)) all.push(log);
      }
    }
    all.sort((a, b) => compareLog(a, b));
    const snapshotManifestHash = sha256(canonical(snapshots));
    const query = sha256(canonical({ address: input.address, from: input.from_block, to: input.to_block,
      topics: input.topics ?? null, snapshot_manifest_hash: snapshotManifestHash }));
    const offset = input.cursor === undefined ? 0 : this.cursors.decode(input.cursor as string, 'get_contract_events', query);
    if (offset > all.length) throw new CursorError();
    const page = all.slice(offset, offset + (limit as number)); const next = offset + page.length < all.length
      ? this.cursors.encode('get_contract_events', query, offset + page.length) : null;
    const decoded = page.map(raw => ({ raw, decoded: decodeStandardEvent(raw.topics as string[], raw.data as string) }));
    return envelope(next ? 'partial' : 'ok', decoded, evidence, snap, { scope: 'contract-events-inclusive-range',
      complete: next === null, truncated: next !== null, snapshot_manifest_hash: snapshotManifestHash }, [], { next_cursor: next });
  }
}

function allowed(name: ToolName): string[] {
  if (name === 'get_block') return ['chain_id', 'block'];
  if (name === 'get_wallet_balance' || name === 'get_contract') return ['chain_id', 'address', 'block'];
  if (name === 'get_contract_events') return ['chain_id', 'address', 'from_block', 'to_block', 'topics', 'limit', 'cursor'];
  return name === 'get_token_transfers' ? ['chain_id', 'tx_hash', 'limit', 'cursor'] : ['chain_id', 'tx_hash'];
}
function pageLimit(input: Record<string, unknown>): number {
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100
    || (input.cursor !== undefined && typeof input.cursor !== 'string')) throw new AdapterError('INVALID_INPUT');
  return limit as number;
}
function compareLog(a: JsonObject, b: JsonObject): number {
  for (const key of ['blockNumber', 'transactionIndex', 'logIndex']) {
    const difference = BigInt(a[key] as string) - BigInt(b[key] as string);
    if (difference) return difference < 0n ? -1 : 1;
  }
  return 0;
}

function publicErrorCode(error: unknown): PublicErrorCode {
  if (error instanceof CursorError) return 'INVALID_CURSOR';
  if (!(error instanceof AdapterError)) return 'PROVIDER_ERROR';
  if (error.code === 'SIZE_LIMIT') return 'BUDGET_EXCEEDED';
  return PUBLIC_ERROR_CODES.includes(error.code as PublicErrorCode) ? error.code as PublicErrorCode : 'PROVIDER_ERROR';
}

function publicErrorMessage(code: PublicErrorCode): string {
  if (code === 'INVALID_INPUT') return 'Input does not match the tool contract.';
  if (code === 'INVALID_CURSOR') return 'Cursor is invalid or expired.';
  if (code === 'UNSUPPORTED_CHAIN') return 'Chain is not supported.';
  if (code === 'BUDGET_EXCEEDED') return 'Call budget was exceeded.';
  return 'The read operation could not be completed.';
}
