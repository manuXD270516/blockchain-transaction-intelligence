import type { extractTokenEvents } from '../events/extract.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';
import type { ReviewedClaim, ReviewedReport } from '../review/types.js';
import { TraceError } from '../traces/calltrace.js';
import type { CallTrace } from '../traces/calltrace.js';

export const MAX_VISUAL_EDGES = 200;
export type EdgeKind = 'transaction_declared' | 'internal_call' | 'emits' | 'inconsistent_log_reported' | 'token_transfer_reported';
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
  call_trace_available: boolean;
  call_trace?: { trace_id: string; transaction_status: string; reverted_subcalls: string[]; coverage: CallTrace['coverage'] };
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  truncation: { limit: number; total: number; shown: number; omitted: number };
  notices: string[];
}

export function buildGraphView(extracted: Extraction, report: ReviewedReport | null, limit = MAX_VISUAL_EDGES, trace: CallTrace | null = null): GraphView {
  const normalized = extracted.normalized;
  const chain = normalized.chain_id;
  const status: EdgeStatus = normalized.execution_status === 'success' ? 'executed'
    : normalized.execution_status === 'reverted' ? 'reverted' : 'unknown';
  if (trace !== null && (trace.tx_id !== normalized.transaction?.id || trace.chain_id !== chain)) throw new TraceError('INCONSISTENT_TRACE');
  const evidence = new Map([...normalized.evidence, ...extracted.derived_evidence, ...(trace?.evidence ?? [])].map(node => [node.evidence_id, node]));
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
  const callOrder = new Map<string, number>();
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
    for (const frame of trace?.frames ?? []) {
      if (frame.depth === 0) continue;
      const delegated = frame.call_type === 'DELEGATECALL' || frame.call_type === 'CALLCODE';
      const caller = address(frame.caller, delegated ? 'delegatecall-context' : 'call-caller');
      let target: string;
      if (frame.target !== null) target = address(frame.target, delegated ? 'delegatecall-code' : 'call-target');
      else {
        target = `${chain}:contract-creation:${frame.id}`;
        nodes.set(target, { id: target, kind: 'contract_creation', label: 'contract creation (address unknown here)', roles: [] });
      }
      const path = frame.trace_path.join('.');
      const value = frame.value_declared_wei ?? 'not reported';
      const detail = frame.value_semantics === 'not_a_transfer'
        ? `${delegated ? `code ${frame.code_address ?? '-'} in context ${frame.context_address ?? '-'}; ` : ''}value_wei ${value} is not a transfer`
        : frame.value_semantics === 'reverted_attempt'
          ? `attempted value_wei ${value} (reverted ${frame.own_reverted ? `here: ${frame.error_observed ?? 'error'}` : 'under ancestor'})`
          : `value_wei ${value} (executed frame)`;
      callOrder.set(`${frame.id}:call`, callOrder.size);
      edge({ id: `${frame.id}:call`, kind: 'internal_call', from: caller, to: target, status: frame.status,
        order: { log_index: null, batch_index: null }, label: `${frame.call_type} trace_path ${path}: ${detail}` }, frame.evidence_ids);
    }
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
  const sorted = [...edges].sort((a, b) => compareEdges(a, b, callOrder));
  const shown = sorted.slice(0, limit).map(value => {
    const ids = cited.get(value.id)!;
    return { ...value, anchor: `edge-${sha256(value.id).slice(0, 16)}`,
      evidence: ids.map(id => ({ evidence_id: id, kind: evidence.get(id)?.kind ?? 'unresolved', transformation: evidence.get(id)?.transformation ?? null })),
      claims: [...new Map(ids.flatMap(id => claims.get(id) ?? []).map(claim => [claim.claim_id, {
        claim_id: claim.claim_id, classification: claim.classification, review_status: claim.review_status }])).values()] };
  });
  const referenced = new Set(shown.flatMap(value => [value.from, value.to]));
  if (tx) referenced.add(tx.id);
  const notices = [trace === null
    ? 'NO_CALL_TRACE: relationships are observed transaction, log and event data; internal calls and causal order are unknown.'
    : 'CALL_TRACE: internal calls are tracer-reported frames; reverted frames and frames under a reverted ancestor are attempts, not effective movements; DELEGATECALL keeps context and code addresses and its inherited value is not a separate transfer.',
    'EVENT_REPORTED: token transfers are reported by events; they do not prove balances, ownership or token conformance.',
    'DECLARED_VALUE: transaction value is declared by the transaction; it does not prove an effective transfer.'];
  if (status === 'unknown') notices.push('EXECUTION_UNKNOWN: no receipt is available; the view does not assert success or failure.');
  if (status === 'reverted') {
    const reason = trace?.frames[0]?.revert_reason ?? null;
    notices.push(trace === null ? 'REVERTED: the receipt reports a revert; the cause is unknown without supported tracing.'
      : reason === null ? 'REVERTED: the receipt reports a revert; the trace reports no revert reason, so the cause is unknown.'
        : `REVERTED: the receipt reports a revert; tracer-reported reason: ${reason}`);
  }
  if (trace !== null && status === 'executed' && trace.reverted_subcalls.length) {
    notices.push(`SUBCALL_REVERTED: the transaction succeeded while subcalls at trace_path ${trace.reverted_subcalls.join(', ')} reverted and were rolled back.`);
  }
  if (trace?.coverage.truncated) {
    notices.push(`TRACE_TRUNCATED: ${trace.coverage.kept_frames} of ${trace.coverage.total_frames} call frames kept; omitted frames do not prove absence of other calls.`);
  }
  if (sorted.length > shown.length) notices.push(`TRUNCATED: showing ${shown.length} of ${sorted.length} edges; omitted edges do not prove absence of other interactions.`);
  if (normalized.mode === 'synthetic') notices.push('SYNTHETIC_DATA: fixture data, not a public transaction.');
  const body = { schema_version: '1.0.0' as const, chain_id: chain, mode: normalized.mode,
    report: report ? { report_id: report.report_id, status: report.status } : null,
    execution_status: normalized.execution_status, call_trace_available: trace !== null,
    ...(trace === null ? {} : { call_trace: { trace_id: trace.trace_id, transaction_status: trace.transaction_status,
      reverted_subcalls: [...trace.reverted_subcalls], coverage: structuredClone(trace.coverage) } }),
    nodes: [...nodes.values()].filter(node => referenced.has(node.id)).sort((a, b) => a.id.localeCompare(b.id))
      .map(node => ({ ...node, roles: [...node.roles].sort() })),
    edges: shown, truncation: { limit, total: sorted.length, shown: shown.length, omitted: sorted.length - shown.length }, notices };
  return { ...body, view_id: sha256(canonical(body)) };
}

function compareEdges(a: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>, b: Omit<GraphEdgeView, 'anchor' | 'evidence' | 'claims'>,
  callOrder: ReadonlyMap<string, number>): number {
  const rank = (value: typeof a) => value.kind === 'transaction_declared' ? 0 : value.kind === 'internal_call' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.kind === 'internal_call') return callOrder.get(a.id)! - callOrder.get(b.id)!;
  const left = a.order.log_index === null ? -1n : BigInt(a.order.log_index);
  const right = b.order.log_index === null ? -1n : BigInt(b.order.log_index);
  if (left !== right) return left < right ? -1 : 1;
  const kind = (value: typeof a) => value.kind === 'token_transfer_reported' ? 1 : 0;
  if (kind(a) !== kind(b)) return kind(a) - kind(b);
  if ((a.order.batch_index ?? -1) !== (b.order.batch_index ?? -1)) return (a.order.batch_index ?? -1) - (b.order.batch_index ?? -1);
  return a.id.localeCompare(b.id);
}
