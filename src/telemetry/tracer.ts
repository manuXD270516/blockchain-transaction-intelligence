import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { redactString } from './redact.js';

export const TELEMETRY_VERSION = 'local-telemetry/1.0.0' as const;
export const MAX_SPANS = 256;
const MAX_ATTRIBUTES = 64;
const MAX_VALUE_CHARS = 512;

export type AttributeValue = string | number | boolean | null;
export type Attributes = Record<string, AttributeValue>;

export interface SpanRecord {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  status: 'ok' | 'error';
  error: { code: string; message: string } | null;
  attributes: Attributes;
}

export interface TraceRecord {
  schema_version: '1.0.0';
  telemetry_version: typeof TELEMETRY_VERSION;
  trace_id: string;
  spans: SpanRecord[];
  dropped_spans: number;
  counters: Record<string, number>;
}

export interface Span {
  set(attributes: Attributes): void;
  count(code: string): void;
}

export interface Telemetry {
  span<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T>;
}

export const NOOP_TELEMETRY: Telemetry = {
  span: (_name, _attributes, fn) => fn({ set() {}, count() {} }),
};

export interface TracerOptions { now?: () => number; ids?: (bytes: 8 | 16) => string }

interface OpenSpan { record: SpanRecord; attributes: Map<string, AttributeValue> }

export class Tracer implements Telemetry {
  readonly trace_id: string;
  private readonly now: () => number;
  private readonly ids: (bytes: 8 | 16) => string;
  private readonly spans: SpanRecord[] = [];
  private readonly counters = new Map<string, number>();
  private readonly active = new AsyncLocalStorage<OpenSpan>();
  private dropped = 0;

  constructor(options: TracerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ids = options.ids ?? (bytes => randomBytes(bytes).toString('hex'));
    this.trace_id = this.ids(16);
  }

  async span<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
    const parent = this.active.getStore();
    const start = this.now();
    const open: OpenSpan = { record: { trace_id: this.trace_id, span_id: this.ids(8), parent_span_id: parent?.record.span_id ?? null,
      name, start_ms: start, end_ms: start, duration_ms: 0, status: 'ok', error: null, attributes: {} }, attributes: new Map() };
    const handle: Span = { set: values => this.assign(open, values), count: code => this.count(code) };
    handle.set(attributes);
    if (this.spans.length < MAX_SPANS) this.spans.push(open.record); else this.dropped++;
    try {
      return await this.active.run(open, () => fn(handle));
    } catch (error) {
      const code = errorCode(error);
      open.record.status = 'error';
      open.record.error = { code, message: clip(redactString(error instanceof Error ? error.message : String(error))) };
      this.count(code);
      throw error;
    } finally {
      open.record.end_ms = this.now();
      open.record.duration_ms = Math.max(0, open.record.end_ms - start);
      open.record.attributes = Object.fromEntries(open.attributes);
    }
  }

  count(code: string): void {
    const key = clip(redactString(code));
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  export(): TraceRecord {
    return { schema_version: '1.0.0', telemetry_version: TELEMETRY_VERSION, trace_id: this.trace_id,
      spans: this.spans.map(span => ({ ...span, attributes: { ...span.attributes } })),
      dropped_spans: this.dropped,
      counters: Object.fromEntries([...this.counters].sort(([a], [b]) => a.localeCompare(b))) };
  }

  private assign(open: OpenSpan, values: Attributes): void {
    for (const [key, value] of Object.entries(values)) {
      if (!open.attributes.has(key) && open.attributes.size >= MAX_ATTRIBUTES) continue;
      open.attributes.set(clip(key), typeof value === 'string' ? clip(redactString(value))
        : typeof value === 'number' && !Number.isFinite(value) ? null : value);
    }
  }
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
    const codes = (error as { codes?: unknown }).codes;
    if (Array.isArray(codes) && typeof codes[0] === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(codes[0])) return codes[0];
  }
  return error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : 'UNKNOWN_ERROR';
}

function clip(value: string): string { return value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS)}…` : value; }

export function toOtlpJson(trace: TraceRecord): unknown {
  const nanos = (ms: number) => (BigInt(Math.round(ms)) * 1000000n).toString();
  const attribute = (key: string, value: AttributeValue) => ({ key, value: value === null ? { stringValue: '' }
    : typeof value === 'boolean' ? { boolValue: value }
      : typeof value === 'number' ? Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
        : { stringValue: value } });
  return { resourceSpans: [{ resource: { attributes: [attribute('service.name', 'blockchain-transaction-intelligence'),
    attribute('telemetry.version', trace.telemetry_version)] },
  scopeSpans: [{ scope: { name: 'bti-local-telemetry', version: '1.0.0' }, spans: trace.spans.map(span => ({
    traceId: span.trace_id, spanId: span.span_id, ...(span.parent_span_id ? { parentSpanId: span.parent_span_id } : {}),
    name: span.name, kind: 1, startTimeUnixNano: nanos(span.start_ms), endTimeUnixNano: nanos(span.end_ms),
    attributes: Object.entries(span.attributes).map(([key, value]) => attribute(key, value)),
    status: span.status === 'ok' ? { code: 1 } : { code: 2, message: `${span.error!.code}: ${span.error!.message}` } })) }] }] };
}
