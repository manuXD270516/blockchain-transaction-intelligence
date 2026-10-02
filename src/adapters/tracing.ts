import * as z from 'zod';
import { sha256 } from '../fixtures/loader.js';
import { parseJson } from '../fixtures/validation.js';
import { AdapterError, HASH, match, record, requireInput } from './contracts.js';
import type { Evidence } from './contracts.js';
import { httpsTransportFor } from './rpc.js';
import type { RpcRequest, RpcTransport } from './rpc.js';

/**
 * Live call tracing: configuration ready, execution pending a provider (openspec change enable-live-tracing).
 * Disabled unless an explicit config enables it. Not part of the main RPC allowlist: only this backend may send
 * `debug_traceTransaction`, always with the fixed `callTracer` and never with caller-supplied tracer code.
 */
export const TRACE_METHOD = 'debug_traceTransaction';
export const FIXED_TRACER = Object.freeze({ tracer: 'callTracer' });
const MAX_TRACE_BYTES = 2 * 1024 * 1024;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const configSchema = z.strictObject({
  schema_version: z.literal('1.0.0'),
  enabled: z.boolean(),
  provider_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  chain_id: z.literal('11155111'),
  endpoint_host: z.string().regex(HOST),
  timeout_ms: z.number().int().min(1).max(20000),
});
export type LiveTraceConfig = z.infer<typeof configSchema>;

export class LiveTracingDisabledError extends Error {
  readonly code = 'LIVE_TRACING_DISABLED';
  constructor() { super('LIVE_TRACING_DISABLED'); this.name = 'LiveTracingDisabledError'; }
}

export function validateLiveTraceConfig(value: unknown): LiveTraceConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) throw new AdapterError('INVALID_INPUT');
  return parsed.data;
}

export class LiveTraceBackend {
  #requests = 0;
  private constructor(private readonly config: LiveTraceConfig, private readonly transport: RpcTransport) {}

  /** Throws LIVE_TRACING_DISABLED unless `config.enabled === true`; no network activity happens before that. */
  static create(config: unknown, transport?: RpcTransport): LiveTraceBackend {
    if (config === undefined || config === null) throw new LiveTracingDisabledError();
    const checked = validateLiveTraceConfig(config);
    if (checked.enabled !== true) throw new LiveTracingDisabledError();
    return new LiveTraceBackend(checked, transport ?? httpsTransportFor(checked.endpoint_host));
  }

  /** Returns the raw callTracer result as evidence for `buildCallTrace`. */
  async traceTransaction(txHash: string): Promise<Evidence> {
    requireInput(match(txHash, HASH));
    const id = ++this.#requests;
    const payload: RpcRequest = { jsonrpc: '2.0', id, method: TRACE_METHOD, params: [txHash, { ...FIXED_TRACER }] };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const bytes = await Promise.race([
        this.transport(payload, controller.signal, MAX_TRACE_BYTES),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AdapterError('TIMEOUT', true)); }, this.config.timeout_ms); }),
      ]);
      if (bytes.length > MAX_TRACE_BYTES) throw new AdapterError('SIZE_LIMIT');
      let parsed: unknown;
      try { parsed = parseJson(bytes, 'payload'); } catch { throw new AdapterError('PROVIDER_ERROR'); }
      if (!record(parsed) || parsed.jsonrpc !== '2.0' || parsed.id !== id
        || Object.hasOwn(parsed, 'result') === Object.hasOwn(parsed, 'error')) throw new AdapterError('PROVIDER_ERROR');
      if (Object.hasOwn(parsed, 'error')) {
        const error = parsed.error;
        if (record(error) && error.code === -32601) throw new AdapterError('UNSUPPORTED_CAPABILITY');
        if (record(error) && (error.code === -32005 || error.code === 429)) throw new AdapterError('RATE_LIMITED', true);
        throw new AdapterError('PROVIDER_ERROR');
      }
      // buildCallTrace consumes the callTracer result itself, so the evidence keeps that exact JSON as raw_utf8.
      const text = JSON.stringify(parsed.result);
      return { schema_version: '1.0.0', provider_id: this.config.provider_id, method: TRACE_METHOD,
        params: [txHash, { ...FIXED_TRACER }], request_id: id, captured_at: new Date().toISOString(), sha256: sha256(text), raw_utf8: text };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
