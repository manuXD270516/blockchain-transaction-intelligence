import type { extractTokenEvents } from '../events/extract.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';
import type { ReviewedClaim, ReviewedReport } from '../review/types.js';

export const MAX_VISUAL_EDGES = 200;
export type EdgeKind = 'transaction_declared' | 'emits' | 'inconsistent_log_reported' | 'token_transfer_reported';
export type EdgeStatus = 'executed' | 'reverted' | 'unknown';
type Extraction = ReturnType<typeof extractTokenEvents>;

export interface GraphNodeView { id: string; kind: 'transaction' | 'address' | 'contract_creation'; label: string; roles: string[] }
export interface GraphEdgeView {
  id: string;
  anchor: string;
  kind: EdgeKind;
  from: string;
  to: string;
  status: EdgeStatus;
  order: { log_index: string | null; batch_index: number | null };
  label: string;
  evidence: { evidence_id: string; kind: string; transformation: string | null }[];
  claims: { claim_id: string; classification: string; review_status: string }[];
}
export interface GraphView {
  schema_version: '1.0.0';
  view_id: string;
  chain_id: string;
  mode: string;
  report: { report_id: string; status: string } | null;
  execution_status: string;
  call_trace_available: false;
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  truncation: { limit: number; total: number; shown: number; omitted: number };
  notices: string[];
}

export function buildGraphView(extracted: Extraction, report: ReviewedReport | null, limit = MAX_VISUAL_EDGES): GraphView {
  const normalized = extracted.normalized;
  const chain = normalized.chain_id;
  const status: EdgeStatus = normalized.execution_status === 'success' ? 'executed'
    : normalized.execution_status === 'reverted' ? 'reverted' : 'unknown';
  const evidence = new Map([...normalized.evidence, ...extracted.derived_evidence].map(node => [node.evidence_id, node]));
  const claims = new Map<string, ReviewedClaim[]>();
  for (const claim of report ? [...report.conclusions, ...report.validated_facts, ...report.audit.claims] : []) {
    for (const id of claim.evidence_ids) claims.set(id, [...claims.get(id) ?? [], claim]);
  }
  const logIndex = new Map(normalized.logs.map(log => [log.id, log.fields.log_index as string]));
  const nodes = new Map<string, GraphNodeView>();
  const address = (value: string, role: string) => {
    const id = `${chain}:address:${value}`;
    const node = nodes.get(id) ?? { id, kind: 'address' as const, label: value, roles: [] };
    if (!node.roles.includes(role)) node.roles.push(role);
    nodes.set(id, node);
    return id;
  };
  const edges: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>[] = [];
  const cited = new Map<string, string[]>();
  const edge = (value: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>, evidenceIds: string[]) => {
    edges.push(value); cited.set(value.id, evidenceIds);
  };
  const tx = normalized.transaction;
  if (tx) {
    const fields = tx.fields;
    nodes.set(tx.id, { id: tx.id, kind: 'transaction', label: `transaction ${fields.hash as string}`, roles: [] });
    const from = address(fields.from as string, 'transaction-from');
    let to: string;
    if (typeof fields.to === 'string') to = address(fields.to, 'transaction-to');
    else {
      to = `${chain}:contract-creation:${fields.hash as string}`;
      nodes.set(to, { id: to, kind: 'contract_creation', label: 'contract creation (address unknown here)', roles: [] });
    }
    edge({ id: `${tx.id}:declared`, kind: 'transaction_declared', from, to, status, order: { log_index: null, batch_index: null },
      label: `value_wei ${fields.value_wei as string} declared` }, [tx.normalization_evidence_id]);
    for (const event of extracted.events) {
      const emitter = address(event.emitter, 'contract-emitter');
      const inconsistent = event.status === 'inconsistent';
      edge({ id: `${event.id}:emits`, kind: inconsistent ? 'inconsistent_log_reported' : 'emits', from: tx.id, to: emitter, status,
        order: { log_index: logIndex.get(event.log_id) ?? null, batch_index: null },
        label: inconsistent ? 'log present in reverted receipt' : `${event.event_name ?? 'unknown event'} (${event.status})` }, event.evidence_ids);
    }
  }
  for (const transfer of extracted.transfers) {
    edge({ id: `${transfer.id}:edge`, kind: 'token_transfer_reported', from: address(transfer.from, 'event-from'),
      to: address(transfer.to, 'event-to'), status, order: { log_index: logIndex.get(transfer.log_id) ?? null, batch_index: transfer.batch_index },
      label: `${transfer.standard_candidate} raw_amount ${transfer.raw_amount}${transfer.token_id === null ? '' : ` token_id ${transfer.token_id}`} (event_reported)` },
    transfer.evidence_ids);
  }
  const sorted = [...edges].sort(compareEdges);
  const shown = sorted.slice(0, limit).map(value => {
    const ids = cited.get(value.id)!;
    return { ...value, anchor: `edge-${sha256(value.id).slice(0, 16)}`,
      evidence: ids.map(id => ({ evidence_id: id, kind: evidence.get(id)?.kind ?? 'unresolved', transformation: evidence.get(id)?.transformation ?? null })),
      claims: [...new Map(ids.flatMap(id => claims.get(id) ?? []).map(claim => [claim.claim_id, {
        claim_id: claim.claim_id, classification: claim.classification, review_status: claim.review_status }])).values()] };
  });
  const referenced = new Set(shown.flatMap(value => [value.from, value.to]));
  if (tx) referenced.add(tx.id);
  const notices = ['NO_CALL_TRACE: relationships are observed transaction, log and event data; internal calls and causal order are unknown.',
    'EVENT_REPORTED: token transfers are reported by events; they do not prove balances, ownership or token conformance.',
    'DECLARED_VALUE: transaction value is declared by the transaction; it does not prove an effective transfer.'];
  if (status === 'unknown') notices.push('EXECUTION_UNKNOWN: no receipt is available; the view does not assert success or failure.');
  if (status === 'reverted') notices.push('REVERTED: the receipt reports a revert; the cause is unknown without supported tracing.');
  if (sorted.length > shown.length) notices.push(`TRUNCATED: showing ${shown.length} of ${sorted.length} edges; omitted edges do not prove absence of other interactions.`);
  if (normalized.mode === 'synthetic') notices.push('SYNTHETIC_DATA: fixture data, not a public transaction.');
  const body = { schema_version: '1.0.0' as const, chain_id: chain, mode: normalized.mode,
    report: report ? { report_id: report.report_id, status: report.status } : null,
    execution_status: normalized.execution_status, call_trace_available: false as const,
    nodes: [...nodes.values()].filter(node => referenced.has(node.id)).sort((a, b) => a.id.localeCompare(b.id))
      .map(node => ({ ...node, roles: [...node.roles].sort() })),
    edges: shown, truncation: { limit, total: sorted.length, shown: shown.length, omitted: sorted.length - shown.length }, notices };
  return { ...body, view_id: sha256(canonical(body)) };
}

function compareEdges(a: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>, b: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>): number {
  const rank = (value: typeof a) => value.kind === 'transaction_declared' ? 0 : 1;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const left = a.order.log_index === null ? -1n : BigInt(a.order.log_index);
  const right = b.order.log_index === null ? -1n : BigInt(b.order.log_index);
  if (left !== right) return left < right ? -1 : 1;
  const kind = (value: typeof a) => value.kind === 'token_transfer_reported' ? 1 : 0;
  if (kind(a) !== kind(b)) return kind(a) - kind(b);
  if ((a.order.batch_index ?? -1) !== (b.order.batch_index ?? -1)) return (a.order.batch_index ?? -1) - (b.order.batch_index ?? -1);
  return a.id.localeCompare(b.id);
}
