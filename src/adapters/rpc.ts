import { request } from 'node:https';
import { lookup } from 'node:dns';
import { BlockList, isIPv4 } from 'node:net';
import { sha256 } from '../fixtures/loader.js';
import { parseJson } from '../fixtures/validation.js';
import type { Json } from '../domain/types.js';
import { AdapterError, ADDRESS, HASH, QUANTITY, match, record, requireInput } from './contracts.js';
import type { Attempt, Evidence } from './contracts.js';
import { EIP1967_IMPLEMENTATION_SLOT } from '../contracts/identify.js';

export const PROVIDER_ID = 'publicnode-sepolia';
const HOSTNAME = 'ethereum-sepolia-rpc.publicnode.com';
const MAX_BYTES = 2 * 1024 * 1024;
export interface RpcRequest { jsonrpc: '2.0'; id: number; method: string; params: readonly Json[] }
export type RpcTransport = (payload: RpcRequest, signal: AbortSignal, maxBytes: number) => Promise<Uint8Array>;

const deniedNetworks = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) deniedNetworks.addSubnet(address, prefix, 'ipv4');

export function publicIPv4(address: string): boolean {
  return isIPv4(address) && !deniedNetworks.check(address, 'ipv4');
}

/** HTTPS JSON-RPC transport pinned to one administrator-configured host: public IPv4 only, no redirects, identity encoding. */
export const httpsTransportFor = (hostname: string): RpcTransport => (payload, signal, maxBytes) => new Promise((resolve, reject) => {
  const req = request({
    hostname, port: 443, path: '/', method: 'POST', signal, family: 4,
    agent: false,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'identity' },
    lookup(host, _options, callback) {
      // Validate and pin the resolved address used by this exact TLS connection.
      lookup(host, { family: 4 }, (error, address) => {
        if (error) return callback(new AdapterError('PROVIDER_ERROR', true), '', 4);
        if (!publicIPv4(address)) return callback(new AdapterError('POLICY_DENIED'), '', 4);
        callback(null, address, 4);
      });
    },
  }, response => {
    const status = response.statusCode ?? 0;
    if (status !== 200) {
      response.destroy();
      reject(new AdapterError(status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR', status === 429 || status >= 500));
      return;
    }
    if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
      response.destroy(); reject(new AdapterError('PROVIDER_ERROR')); return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new AdapterError('SIZE_LIMIT'));
        response.destroy();
      } else chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('aborted', () => reject(new AdapterError('PROVIDER_ERROR', true)));
    response.on('error', () => reject(new AdapterError('PROVIDER_ERROR', true)));
  });
  req.on('error', error => reject(signal.aborted ? new AdapterError('TIMEOUT', true)
    : error instanceof AdapterError ? error : new AdapterError('PROVIDER_ERROR', true)));
  req.end(JSON.stringify(payload));
});
export const httpsTransport: RpcTransport = httpsTransportFor(HOSTNAME);

const methods = new Set([
  'eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockByHash',
  'eth_getBlockByNumber', 'eth_getBalance', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt',
]);
function validParams(method: string, params: readonly Json[]): void {
  if (!methods.has(method)) throw new AdapterError('POLICY_DENIED');
  requireInput(Array.isArray(params));
  const [first, second] = params;
  switch (method) {
    case 'eth_chainId': requireInput(params.length === 0); break;
    case 'eth_getTransactionByHash':
    case 'eth_getTransactionReceipt': requireInput(params.length === 1 && match(first, HASH)); break;
    case 'eth_getBlockByHash': requireInput(params.length === 2 && match(first, HASH) && second === false); break;
    case 'eth_getBlockByNumber':
      requireInput(params.length === 2 && (match(first, QUANTITY) || ['latest', 'safe', 'finalized'].includes(String(first))) && second === false);
      break;
    case 'eth_getBalance':
    case 'eth_getCode': requireInput(params.length === 2 && match(first, ADDRESS) && match(second, QUANTITY)); break;
    // Only the EIP-1967 implementation slot may be read, and only at a pinned block number (historical proxy resolution).
    case 'eth_getStorageAt': if (!(params.length === 3 && match(first, ADDRESS) && second === EIP1967_IMPLEMENTATION_SLOT
      && match(params[2], QUANTITY))) throw new AdapterError('POLICY_DENIED'); break;
    case 'eth_getLogs': requireInput(params.length === 1 && record(first) && Object.keys(first).length === 2
      && match(first.address, ADDRESS) && match(first.blockHash, HASH)); break;
  }
}

export interface RpcOptions { timeoutMs?: number; deadlineMs?: number; maxCalls?: number; backoffMs?: number }
export class RpcSession {
  readonly evidence: Evidence[] = [];
  readonly attempts: Attempt[] = [];
  #count = 0;
  readonly #deadline: number;
  readonly #timeout: number;
  readonly #maxCalls: number;
  readonly #backoff: number;

  constructor(private readonly transport: RpcTransport, options: RpcOptions = {}) {
    this.#timeout = options.timeoutMs ?? 10000;
    this.#maxCalls = options.maxCalls ?? 24;
    this.#backoff = options.backoffMs ?? 100;
    const deadline = options.deadlineMs ?? 90000;
    for (const [value, max, min] of [[this.#timeout, 10000, 1], [this.#maxCalls, 24, 1],
      [this.#backoff, 1000, 0], [deadline, 90000, 1]]) {
      requireInput(Number.isSafeInteger(value) && value! >= min! && value! <= max!);
    }
    this.#deadline = performance.now() + deadline;
  }

  async call(method: string, params: readonly Json[]): Promise<Json> {
    validParams(method, params);
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = this.#deadline - performance.now();
      if (remaining <= 0 || this.#count >= this.#maxCalls) throw new AdapterError('BUDGET_EXCEEDED');
      const id = ++this.#count;
      const payload: RpcRequest = { jsonrpc: '2.0', id, method, params };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const started = performance.now();
      try {
        const bytes = await Promise.race([
          this.transport(payload, controller.signal, MAX_BYTES),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new AdapterError('TIMEOUT', true)); }, Math.min(this.#timeout, remaining));
          }),
        ]);
        if (bytes.length > MAX_BYTES) throw new AdapterError('SIZE_LIMIT');
        let parsed: unknown;
        try { parsed = parseJson(bytes, 'payload'); } catch { throw new AdapterError('PROVIDER_ERROR'); }
        if (!record(parsed) || parsed.jsonrpc !== '2.0' || parsed.id !== id
          || Object.hasOwn(parsed, 'result') === Object.hasOwn(parsed, 'error')) throw new AdapterError('PROVIDER_ERROR');
        if (Object.hasOwn(parsed, 'error')) {
          const error = parsed.error;
          if (!record(error) || !Number.isSafeInteger(error.code) || typeof error.message !== 'string') throw new AdapterError('PROVIDER_ERROR');
          if (error.code === -32601) throw new AdapterError('UNSUPPORTED_CAPABILITY');
          if (/missing trie node|historical state (?:is )?unavailable|state (?:is )?pruned/i.test(error.message)) throw new AdapterError('PRUNED_STATE');
          if (error.code === -32005 || error.code === 429) throw new AdapterError('RATE_LIMITED', true);
          throw new AdapterError('PROVIDER_ERROR');
        }
        const result = parsed.result as Json;
        this.evidence.push({ schema_version: '1.0.0', provider_id: PROVIDER_ID, method, params: structuredClone(params),
          request_id: id, captured_at: new Date().toISOString(), sha256: sha256(bytes), raw_utf8: Buffer.from(bytes).toString('utf8') });
        this.attempts.push({ request_id: id, method, outcome: 'ok', duration_ms: performance.now() - started });
        return result;
      } catch (error) {
        const safe = error instanceof AdapterError ? error : new AdapterError('PROVIDER_ERROR');
        this.attempts.push({ request_id: id, method, outcome: safe.code, duration_ms: performance.now() - started });
        if (!safe.retryable || attempt === 1) throw safe;
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
      if (this.#count >= this.#maxCalls || performance.now() + this.#backoff >= this.#deadline) throw new AdapterError('BUDGET_EXCEEDED');
      await new Promise(resolve => setTimeout(resolve, this.#backoff));
    }
    throw new AdapterError('PROVIDER_ERROR');
  }
}
