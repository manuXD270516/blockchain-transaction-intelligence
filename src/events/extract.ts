import type { Investigation } from '../adapters/contracts.js';
import type { Json } from '../domain/types.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical, freeze } from '../normalization/evidence.js';
import type { EvidenceNode } from '../normalization/evidence.js';
import { normalizeInvestigation } from '../normalization/normalize.js';
import { decodeStandardEvent } from './decode.js';
import type { Decoded, Standard } from './decode.js';

const VERSION = 'standard-token-events/1.0.0';
export const MAX_LOGS = 10000;
export const MAX_TRANSFERS = 10000;
export interface Transfer {
  schema_version: '1.0.0'; id: string; log_id: string; batch_index: number;
  token_address: string; standard_candidate: Standard; operator: string | null;
  from: string; to: string; token_id: string | null; raw_amount: string;
  decimals: null; symbol: null; semantics: 'event_reported'; evidence_ids: string[];
}
export interface Event extends Omit<Decoded, 'status'> {
  schema_version: '1.0.0'; id: string; log_id: string; emitter: string; topic0: string | null;
  status: Decoded['status'] | 'inconsistent'; evidence_ids: string[]; raw_log: Record<string, Json>;
}

export function extractTokenEvents(input: Investigation) {
  const normalized = normalizeInvestigation(input);
  const derived: EvidenceNode[] = [];
  const events: Event[] = [];
  const transfers: Transfer[] = [];
  const warnings = new Set<string>(['EVENTS_DO_NOT_PROVE_TOKEN_CONFORMANCE_OR_NET_BALANCES']);
  const knownIds = new Set(normalized.evidence.map(n => n.evidence_id));
  function derive(value: Json, parent: string, transformation: string, fieldSources: Record<string, string[]>): string {
    if (!knownIds.has(parent)) throw new Error('MISSING_PARENT_EVIDENCE');
    const body = { schema_version: '1.0.0' as const, kind: 'derived' as const, content_hash: sha256(canonical(value)),
      context: { chain_id: input.chain_id, mode: input.mode }, parent_evidence_ids: [parent],
      source: null, transformation, field_sources: fieldSources, value };
    const id = sha256(canonical(body));
    if (!knownIds.has(id)) { derived.push({ ...body, evidence_id: id }); knownIds.add(id); }
    return id;
  }

  // Receipt order is retained, including unknown and malformed logs.
  for (const log of normalized.logs.slice(0, MAX_LOGS)) {
    const raw = log.fields;
    let decoded: Decoded | Omit<Event, 'schema_version' | 'id' | 'log_id' | 'emitter' | 'topic0' | 'evidence_ids' | 'raw_log'>;
    if (normalized.execution_status === 'reverted') decoded = { status: 'inconsistent', reason: 'REVERTED_RECEIPT_WITH_LOGS',
      standard_candidate: null, event_name: null, arguments: null, reference: null };
    else decoded = decodeStandardEvent(raw.topics as readonly string[], raw.data as string);
    const args = decoded.arguments;
    const batchCount = decoded.event_name === 'TransferBatch' && args ? (args.ids as readonly Json[]).length : 1;
    if (decoded.status === 'decoded' && transfers.length + batchCount > MAX_TRANSFERS) {
      decoded = { status: 'limit_exceeded', reason: 'RUN_TRANSFER_LIMIT', standard_candidate: null, event_name: null, arguments: null, reference: null };
    }
    const event: Event = { schema_version: '1.0.0', id: `${log.id}:event`, log_id: log.id,
      emitter: raw.address as string, topic0: (raw.topics as readonly string[])[0] ?? null,
      ...decoded, evidence_ids: [log.normalization_evidence_id], raw_log: raw };
    events.push(event);
    if (decoded.status !== 'decoded' || !decoded.arguments || !decoded.standard_candidate) continue;
    const eventEvidence = derive({ log_id: log.id, ...decoded }, log.normalization_evidence_id, VERSION, { log: [''] });
    event.evidence_ids.push(eventEvidence);
    const decodedArgs = decoded.arguments;
    for (let index = 0; index < batchCount; index++) {
      const isBatch = decoded.event_name === 'TransferBatch';
      const record = { schema_version: '1.0.0' as const, id: `${log.id}:transfer:${index}`, log_id: log.id, batch_index: index,
        token_address: event.emitter, standard_candidate: decoded.standard_candidate,
        operator: (decodedArgs.operator as string | undefined) ?? null, from: decodedArgs.from as string, to: decodedArgs.to as string,
        token_id: decoded.standard_candidate === 'ERC-20' ? null : isBatch ? (decodedArgs.ids as string[])[index]! : decodedArgs.token_id as string,
        raw_amount: decoded.standard_candidate === 'ERC-721' ? '1' : isBatch ? (decodedArgs.values as string[])[index]! : decodedArgs.value as string,
        decimals: null, symbol: null, semantics: 'event_reported' as const };
      const transferEvidence = derive(record, eventEvidence, `${VERSION}:transfer`,
        { arguments: ['/arguments'], ...(isBatch ? { item: [`/arguments/ids/${index}`, `/arguments/values/${index}`] } : {}) });
      transfers.push({ ...record, evidence_ids: [eventEvidence, transferEvidence] });
    }
  }
  const receiptMissing = normalized.receipt === null;
  const counts = { total_logs: normalized.logs.length, processed_logs: events.length,
    omitted_logs: normalized.logs.length - events.length, decoded: 0, unknown: 0, ambiguous: 0, malformed: 0, inconsistent: 0, limit_exceeded: 0 };
  for (const event of events) counts[event.status]++;
  if (receiptMissing) warnings.add('RECEIPT_MISSING_CANNOT_ASSERT_NO_TRANSFERS');
  if (counts.inconsistent) warnings.add('REVERTED_RECEIPT_WITH_LOGS');
  if (counts.omitted_logs) warnings.add('RUN_LOG_LIMIT');
  const coverage = { ...counts, receipt_available: !receiptMissing,
    status: receiptMissing || counts.omitted_logs > 0 || events.some(e => e.status !== 'decoded') ? 'partial' : 'complete',
    scope: 'supported-standard-event-layouts', transfers: transfers.length };
  const graph = buildGraph(normalized.transaction?.id ?? null, input.chain_id, events, transfers, coverage.status);
  const body = { schema_version: '1.0.0', extractor_version: VERSION, normalized,
    events, transfers, derived_evidence: derived, graph, coverage, warnings: [...warnings].sort() };
  return freeze({ ...body, extraction_id: sha256(canonical(body)) });
}

function buildGraph(transactionId: string | null, chain: string, events: readonly Event[], transfers: readonly Transfer[], coverage: string) {
  const nodes = new Map<string, { id: string; type: 'transaction' | 'address'; roles: string[] }>();
  const edges: { id: string; from: string; to: string; kind: string; evidence_ids: string[]; transfer_id: string | null }[] = [];
  if (transactionId) nodes.set(transactionId, { id: transactionId, type: 'transaction', roles: [] });
  const address = (value: string, role: string) => {
    const id = `${chain}:address:${value}`;
    const node = nodes.get(id) ?? { id, type: 'address' as const, roles: [] };
    if (!node.roles.includes(role)) node.roles.push(role);
    nodes.set(id, node); return id;
  };
  for (const event of events) {
    const emitter = address(event.emitter, 'contract-emitter');
    if (transactionId) edges.push({ id: `${event.id}:emits`, from: transactionId, to: emitter,
      kind: event.status === 'inconsistent' ? 'inconsistent_log_reported' : 'emits', evidence_ids: event.evidence_ids, transfer_id: null });
  }
  for (const transfer of transfers) edges.push({ id: `${transfer.id}:edge`, from: address(transfer.from, 'event-from'),
    to: address(transfer.to, 'event-to'), kind: 'token_transfer_reported', evidence_ids: transfer.evidence_ids, transfer_id: transfer.id });
  return { schema_version: '1.0.0', coverage, nodes: [...nodes.values()], edges, call_trace_available: false };
}
