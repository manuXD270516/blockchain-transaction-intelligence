import type { Json, JsonObject } from '../domain/types.js';
import { AdapterError, ADDRESS, HASH, QUANTITY, consistent, match, record, requireData, requireInput } from './contracts.js';
import type { BlockRead, BlockRef, Capabilities, ChainAdapter, Investigation, Snapshot } from './contracts.js';
import { httpsTransport, RpcSession } from './rpc.js';
import type { RpcOptions, RpcTransport } from './rpc.js';
import { EIP1967_IMPLEMENTATION_SLOT } from '../contracts/identify.js';

export const SEPOLIA_CHAIN_ID = '11155111';
const CAPABILITIES: Capabilities = Object.freeze({ receipts: true, logs: true, historical_state: 'unknown',
  safe_finalized: 'unknown', trace: 'unsupported', abi_enrichment: 'unsupported' });

function transaction(value: Json, requested: string): JsonObject | null {
  if (value === null) return null;
  requireData(record(value) && match(value.hash, HASH) && match(value.from, ADDRESS)
    && (value.to === null || match(value.to, ADDRESS)) && match(value.value, QUANTITY)
    && match(value.nonce, QUANTITY) && match(value.input, /^0x(?:[0-9a-f]{2})*$/)
    && (value.blockHash === null || match(value.blockHash, HASH))
    && (value.blockNumber === null || match(value.blockNumber, QUANTITY)));
  consistent(value.hash === requested && (value.blockHash === null) === (value.blockNumber === null));
  if (value.chainId !== undefined) consistent(match(value.chainId, QUANTITY) && BigInt(value.chainId).toString() === SEPOLIA_CHAIN_ID);
  return value;
}

function block(value: Json): JsonObject | null {
  if (value === null) return null;
  requireData(record(value) && match(value.hash, HASH) && match(value.number, QUANTITY)
    && match(value.parentHash, HASH) && match(value.timestamp, QUANTITY)
    && Array.isArray(value.transactions) && value.transactions.every(h => match(h, HASH)));
  return value;
}

function validateLogs(value: Json, snapshotHash: string, snapshotNumber: string, address?: string, txHash?: string): readonly JsonObject[] {
  requireData(Array.isArray(value));
  const seen = new Set<string>();
  for (const log of value) {
    requireData(record(log) && match(log.address, ADDRESS) && match(log.blockHash, HASH)
      && match(log.blockNumber, QUANTITY) && match(log.transactionHash, HASH)
      && match(log.transactionIndex, QUANTITY) && match(log.logIndex, QUANTITY)
      && match(log.data, /^0x(?:[0-9a-f]{2})*$/) && Array.isArray(log.topics)
      && log.topics.length <= 4 && log.topics.every(t => match(t, HASH)) && log.removed === false);
    consistent(log.blockHash === snapshotHash && log.blockNumber === snapshotNumber
      && (address === undefined || log.address === address) && (txHash === undefined || log.transactionHash === txHash)
      && !seen.has(log.logIndex));
    seen.add(log.logIndex);
  }
  return value as readonly JsonObject[];
}

function receipt(value: Json, tx: JsonObject): JsonObject | null {
  if (value === null) return null;
  requireData(record(value) && match(value.transactionHash, HASH) && match(value.blockHash, HASH)
    && match(value.blockNumber, QUANTITY) && (value.status === '0x0' || value.status === '0x1'));
  consistent(value.transactionHash === tx.hash && value.blockHash === tx.blockHash && value.blockNumber === tx.blockNumber);
  validateLogs(value.logs ?? null, value.blockHash, value.blockNumber, undefined, value.transactionHash);
  return value;
}

function blockReference(ref: BlockRef): { method: string; argument: string; finality: Snapshot['finality'] } {
  requireInput(record(ref) && Object.keys(ref).length === 1);
  if ('hash' in ref) {
    requireInput(match(ref.hash, HASH));
    return { method: 'eth_getBlockByHash', argument: ref.hash, finality: 'unknown' };
  }
  if ('number' in ref) {
    requireInput(match(ref.number, /^(?:0|[1-9][0-9]{0,77})$/));
    const hex = `0x${BigInt(ref.number).toString(16)}`;
    requireInput(match(hex, QUANTITY));
    return { method: 'eth_getBlockByNumber', argument: hex, finality: 'unknown' };
  }
  requireInput('tag' in ref && ['latest', 'safe', 'finalized'].includes(ref.tag));
  return { method: 'eth_getBlockByNumber', argument: ref.tag, finality: ref.tag === 'latest' ? 'unknown' : ref.tag };
}

export class EthereumAdapter implements ChainAdapter {
  readonly capabilities = CAPABILITIES;
  constructor(private readonly transport: RpcTransport = httpsTransport, private readonly options: RpcOptions = {}) {}

  async #run<T>(operation: (session: RpcSession) => Promise<T>): Promise<T> {
    const session = new RpcSession(this.transport, this.options);
    try {
      const chain = await session.call('eth_chainId', []);
      requireData(match(chain, QUANTITY));
      if (BigInt(chain).toString() !== SEPOLIA_CHAIN_ID) throw new AdapterError('UNSUPPORTED_CHAIN');
      return await operation(session);
    } catch (error) {
      const safe = error instanceof AdapterError ? error : new AdapterError('PROVIDER_ERROR');
      safe.evidence = [...session.evidence];
      safe.attempts = [...session.attempts];
      throw safe;
    }
  }

  async #canonical(session: RpcSession, current: JsonObject): Promise<void> {
    const canonical = block(await session.call('eth_getBlockByNumber', [current.number!, false]));
    consistent(canonical !== null && canonical.hash === current.hash && canonical.number === current.number);
  }

  async #resolve(session: RpcSession, ref: BlockRef): Promise<{ raw: JsonObject; snapshot: Snapshot }> {
    const request = blockReference(ref);
    const raw = block(await session.call(request.method, [request.argument, false]));
    if (raw === null) throw new AdapterError('PROVIDER_ERROR');
    if ('hash' in ref) consistent(raw.hash === ref.hash);
    if ('number' in ref) consistent(BigInt(raw.number as string).toString() === ref.number);
    await this.#canonical(session, raw);
    return { raw, snapshot: { chain_id: SEPOLIA_CHAIN_ID, block_hash: raw.hash as string,
      block_number: BigInt(raw.number as string).toString(), finality: request.finality } };
  }

  async investigate(txHash: string): Promise<Investigation> {
    requireInput(match(txHash, HASH));
    return this.#run(async session => {
    const tx = transaction(await session.call('eth_getTransactionByHash', [txHash]), txHash);
    const base: Investigation = { schema_version: '1.0.0', mode: 'testnet_live', chain_id: SEPOLIA_CHAIN_ID,
      status: 'not_found', execution_status: 'unknown', snapshot: null,
      raw: { transaction: tx, receipt: null, block: null }, capabilities: CAPABILITIES,
      evidence: session.evidence, attempts: session.attempts, warnings: ['M1_RAW_DATA_NOT_A_REVIEWED_ANALYSIS'] };
    if (tx === null) return base;
    const rec = receipt(await session.call('eth_getTransactionReceipt', [txHash]), tx);
    base.raw.receipt = rec;
    if (tx.blockHash === null) {
      consistent(rec === null);
      return { ...base, status: 'partial', execution_status: 'pending', warnings: [...base.warnings, 'RECEIPT_NOT_AVAILABLE'] };
    }
    const blk = block(await session.call('eth_getBlockByHash', [tx.blockHash!, false]));
    base.raw.block = blk;
    base.snapshot = { chain_id: SEPOLIA_CHAIN_ID, block_hash: tx.blockHash as string,
      block_number: BigInt(tx.blockNumber as string).toString(), finality: 'unknown' };
    const warnings = [...base.warnings];
    if (blk === null) warnings.push('BLOCK_NOT_AVAILABLE', 'SNAPSHOT_NOT_CONFIRMED');
    else {
      consistent(blk.hash === tx.blockHash && blk.number === tx.blockNumber
        && (blk.transactions as readonly Json[]).includes(txHash));
      await this.#canonical(session, blk);
    }
    if (rec === null) warnings.push('RECEIPT_NOT_AVAILABLE');
    if (rec?.status === '0x0') warnings.push('REVERT_REASON_UNKNOWN');
    return { ...base, status: rec === null || blk === null ? 'partial' : 'ok',
      execution_status: rec === null ? 'unknown' : rec.status === '0x1' ? 'success' : 'reverted', warnings };
    });
  }

  async getBlock(ref: BlockRef): Promise<BlockRead<JsonObject>> {
    blockReference(ref); // Inputs are rejected before any network access.
    return this.#run(async session => {
      const resolved = await this.#resolve(session, ref);
      return { schema_version: '1.0.0', data: resolved.raw, snapshot: resolved.snapshot, evidence: session.evidence, attempts: session.attempts };
    });
  }

  async #state(method: 'eth_getBalance' | 'eth_getCode' | 'eth_getLogs' | 'eth_getStorageAt', address: string, ref: BlockRef): Promise<BlockRead<Json>> {
    requireInput(match(address, ADDRESS));
    blockReference(ref);
    return this.#run(async session => {
    const { raw, snapshot } = await this.#resolve(session, ref);
    const data = await session.call(method, method === 'eth_getLogs' ? [{ address, blockHash: snapshot.block_hash }]
      : method === 'eth_getStorageAt' ? [address, EIP1967_IMPLEMENTATION_SLOT, raw.number!] : [address, raw.number!]);
    if (method === 'eth_getBalance') requireData(match(data, QUANTITY));
    else if (method === 'eth_getCode') requireData(match(data, /^0x(?:[0-9a-f]{2})*$/));
    else if (method === 'eth_getStorageAt') requireData(match(data, /^0x[0-9a-f]{64}$/));
    else {
      const logs = validateLogs(data, snapshot.block_hash, raw.number as string, address);
      for (const log of logs) consistent((raw.transactions as readonly Json[]).includes(log.transactionHash!));
    }
    await this.#canonical(session, raw);
    return { schema_version: '1.0.0', data, snapshot, evidence: session.evidence, attempts: session.attempts };
    });
  }

  getBalance(address: string, ref: BlockRef): Promise<BlockRead<Json>> { return this.#state('eth_getBalance', address, ref); }
  getCode(address: string, ref: BlockRef): Promise<BlockRead<Json>> { return this.#state('eth_getCode', address, ref); }
  getLogs(address: string, ref: BlockRef): Promise<BlockRead<Json>> { return this.#state('eth_getLogs', address, ref); }
  /** Reads only the EIP-1967 implementation slot at a pinned block, for historical proxy resolution. */
  getStorageAt(address: string, ref: BlockRef): Promise<BlockRead<Json>> { return this.#state('eth_getStorageAt', address, ref); }
}
