import type { Evidence, Investigation } from '../adapters/contracts.js';
import type { Json } from '../domain/types.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical, freeze } from '../normalization/evidence.js';
import type { EvidenceNode } from '../normalization/evidence.js';
import { normalizeInvestigation } from '../normalization/normalize.js';

export const TRACE_VERSION = 'call-trace/1.0.0';
export const MAX_TRACE_FRAMES = 1000;
export const MAX_TRACE_DEPTH = 64;
export const MAX_TRACE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 1024;
const MAX_INPUT_HEX = 2 * 128 * 1024;
const CALL_TYPES = ['CALL', 'STATICCALL', 'DELEGATECALL', 'CALLCODE', 'CREATE', 'CREATE2', 'SELFDESTRUCT'] as const;
const FRAME_KEYS = new Set(['type', 'from', 'to', 'value', 'gas', 'gasUsed', 'input', 'output', 'error', 'revertReason', 'calls']);
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
const HEX = /^0x(?:[0-9a-f]{2})*$/;

export type CallType = typeof CALL_TYPES[number];
export type TraceErrorCode = 'INVALID_TRACE' | 'INCONSISTENT_TRACE' | 'TRACE_REQUIRES_RECEIPT' | 'SIZE_LIMIT';
export class TraceError extends Error {
  constructor(public readonly code: TraceErrorCode) { super(code); this.name = 'TraceError'; }
}
export interface TraceLimits { frames: number; depth: number }
export interface CallFrame {
  schema_version: '1.0.0';
  id: string;
  trace_path: number[];
  depth: number;
  call_type: CallType;
  caller: string;
  target: string | null;
  context_address: string | null;
  code_address: string | null;
  value_declared_wei: string | null;
  value_semantics: 'not_a_transfer' | 'reverted_attempt' | 'executed_frame';
  native_value_effective_wei: string | null;
  input_selector: string | null;
  gas_used: string | null;
  error_observed: string | null;
  revert_reason: string | null;
  own_reverted: boolean;
  ancestor_reverted: boolean;
  status: 'executed' | 'reverted';
  evidence_ids: string[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fail(code: TraceErrorCode = 'INVALID_TRACE'): never { throw new TraceError(code); }
function optional(frame: Record<string, unknown>, key: string, pattern: RegExp): string | null {
  if (!Object.hasOwn(frame, key)) return null;
  const value = frame[key];
  if (typeof value !== 'string' || !pattern.test(value)) fail();
  return value;
}
function text(frame: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(frame, key)) return null;
  const value = frame[key];
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_TEXT) fail();
  return value;
}

/** Normalizes a tracer-reported callTracer trace for the transaction in `input`. Pure: no I/O. */
export function buildCallTrace(input: Investigation, source: Evidence, limits: TraceLimits = { frames: MAX_TRACE_FRAMES, depth: MAX_TRACE_DEPTH }) {
  if (!Number.isSafeInteger(limits.frames) || limits.frames < 1 || limits.frames > MAX_TRACE_FRAMES
    || !Number.isSafeInteger(limits.depth) || limits.depth < 0 || limits.depth > MAX_TRACE_DEPTH) fail();
  if (typeof source.raw_utf8 !== 'string') fail();
  if (Buffer.byteLength(source.raw_utf8) > MAX_TRACE_BYTES) fail('SIZE_LIMIT');
  if (sha256(source.raw_utf8) !== source.sha256) fail();
  let root: unknown;
  try { root = JSON.parse(source.raw_utf8); } catch { fail(); }

  const normalized = normalizeInvestigation(input);
  const tx = normalized.transaction;
  if (tx === null || normalized.receipt === null || normalized.snapshot === null) fail('TRACE_REQUIRES_RECEIPT');
  const transactionStatus = normalized.execution_status;
  if (transactionStatus !== 'success' && transactionStatus !== 'reverted') fail('TRACE_REQUIRES_RECEIPT');

  const context = { chain_id: input.chain_id, mode: input.mode };
  const rawBody = { schema_version: '1.0.0' as const, kind: input.mode === 'synthetic' ? 'fixture_materialized' as const : 'rpc_raw' as const,
    content_hash: source.sha256, context, parent_evidence_ids: [tx.normalization_evidence_id], source: structuredClone(source),
    transformation: null, field_sources: {}, value: null };
  const rawNode: EvidenceNode = { ...rawBody, evidence_id: sha256(canonical(rawBody)) };
  const evidence: EvidenceNode[] = [rawNode];

  const frames: CallFrame[] = [];
  let total = 0;
  let omitted = 0;
  let depthExceeded = false;
  // Iterative preorder walk; every frame is validated even when it is omitted from the output.
  const stack: { frame: unknown; path: number[]; ancestorReverted: boolean; pointer: string }[] = [
    { frame: root, path: [], ancestorReverted: false, pointer: '' }];
  while (stack.length) {
    const item = stack.pop()!;
    const frame = item.frame;
    if (!object(frame) || !Object.keys(frame).every(key => FRAME_KEYS.has(key))) fail();
    if (!CALL_TYPES.includes(frame.type as CallType)) fail();
    const callType = frame.type as CallType;
    const caller = optional(frame, 'from', ADDRESS) ?? fail();
    const target = optional(frame, 'to', ADDRESS);
    if (target === null && !callType.startsWith('CREATE')) fail();
    const value = optional(frame, 'value', QUANTITY);
    const gasUsed = optional(frame, 'gasUsed', QUANTITY);
    optional(frame, 'gas', QUANTITY);
    const callInput = optional(frame, 'input', HEX) ?? fail();
    if (callInput.length > MAX_INPUT_HEX + 2) fail('SIZE_LIMIT');
    const output = optional(frame, 'output', HEX);
    if (output !== null && output.length > MAX_INPUT_HEX + 2) fail('SIZE_LIMIT');
    const error = text(frame, 'error');
    const reason = text(frame, 'revertReason');
    if (reason !== null && error === null) fail();
    const children = Object.hasOwn(frame, 'calls') ? frame.calls : [];
    if (!Array.isArray(children)) fail();
    total++;
    if (total > MAX_TRACE_FRAMES * 100) fail('SIZE_LIMIT');

    const ownReverted = error !== null;
    const depth = item.path.length;
    const kept = depth <= limits.depth && frames.length < limits.frames;
    if (depth > limits.depth) depthExceeded = true;
    if (kept) {
      const delegated = callType === 'DELEGATECALL' || callType === 'CALLCODE';
      const reverted = ownReverted || item.ancestorReverted;
      const semantics = callType === 'DELEGATECALL' || callType === 'STATICCALL' ? 'not_a_transfer' as const
        : reverted ? 'reverted_attempt' as const : 'executed_frame' as const;
      const declared = value === null ? null : BigInt(value).toString();
      const record = { schema_version: '1.0.0' as const, id: `${tx.id}:trace:${item.path.length ? item.path.join('.') : 'root'}`,
        trace_path: item.path, depth, call_type: callType, caller, target,
        context_address: delegated ? caller : target, code_address: target,
        value_declared_wei: declared, value_semantics: semantics,
        native_value_effective_wei: semantics === 'executed_frame' ? declared : null,
        input_selector: callInput.length >= 10 ? callInput.slice(0, 10) : null,
        gas_used: gasUsed === null ? null : BigInt(gasUsed).toString(),
        error_observed: error, revert_reason: reason, own_reverted: ownReverted, ancestor_reverted: item.ancestorReverted,
        status: reverted ? 'reverted' as const : 'executed' as const };
      const body = { schema_version: '1.0.0' as const, kind: 'derived' as const, content_hash: sha256(canonical(record)), context,
        parent_evidence_ids: [rawNode.evidence_id], source: null, transformation: TRACE_VERSION,
        field_sources: { frame: [item.pointer] }, value: record as unknown as Json };
      const node: EvidenceNode = { ...body, evidence_id: sha256(canonical(body)) };
      if (!evidence.some(existing => existing.evidence_id === node.evidence_id)) evidence.push(node);
      frames.push({ ...record, evidence_ids: [node.evidence_id] });
    } else omitted++;

    if (depth === 0) {
      const fields = tx.fields;
      if (caller !== fields.from || target !== fields.to || (value === null ? '0' : BigInt(value).toString()) !== fields.value_wei
        || callInput !== fields.input || ownReverted !== (transactionStatus === 'reverted')) fail('INCONSISTENT_TRACE');
    }
    for (let index = children.length - 1; index >= 0; index--) {
      stack.push({ frame: children[index], path: [...item.path, index], ancestorReverted: item.ancestorReverted || ownReverted,
        pointer: `${item.pointer}/calls/${index}` });
    }
  }

  const rootFrame = frames[0]!;
  const revertedSubcalls = frames.filter(frame => frame.depth > 0 && frame.own_reverted).map(frame => frame.trace_path.join('.'));
  const truncated = omitted > 0;
  const warnings = new Set(['TRACE_IS_TRACER_REPORTED']);
  if (input.mode === 'synthetic') warnings.add('SYNTHETIC_DATA_NOT_A_PUBLIC_TRANSACTION');
  if (truncated) warnings.add('TRACE_TRUNCATED');
  if (transactionStatus === 'success' && revertedSubcalls.length) warnings.add('SUBCALL_REVERTED_TRANSACTION_SUCCEEDED');
  if (rootFrame.own_reverted && rootFrame.revert_reason === null) warnings.add('REVERT_REASON_UNKNOWN');
  if (frames.some(frame => frame.call_type === 'DELEGATECALL' && frame.value_declared_wei !== null)) warnings.add('DELEGATECALL_VALUE_IS_NOT_A_TRANSFER');
  const body = { schema_version: '1.0.0' as const, trace_version: TRACE_VERSION, chain_id: input.chain_id, mode: input.mode,
    tx_id: tx.id, snapshot: structuredClone(normalized.snapshot), transaction_status: transactionStatus,
    reverted_subcalls: revertedSubcalls, frames,
    coverage: { status: truncated ? 'partial' as const : 'complete' as const, scope: 'tracer-reported-call-frames',
      total_frames: total, kept_frames: frames.length, omitted_frames: omitted, truncated,
      limits: { frames: limits.frames, depth: limits.depth }, depth_exceeded: depthExceeded },
    evidence, warnings: [...warnings].sort() };
  return freeze({ ...body, trace_id: sha256(canonical(body)) });
}

export type CallTrace = ReturnType<typeof buildCallTrace>;
