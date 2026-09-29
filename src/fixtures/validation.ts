import { FixtureError } from '../domain/errors.js';
import type { Artifact, FixtureManifest, Json, JsonObject, RawPayloads } from '../domain/types.js';

export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const FIXTURE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(k => Object.hasOwn(value, k));
}

function matches(value: unknown, expression: RegExp): value is string {
  return typeof value === 'string' && expression.test(value);
}

function text(value: unknown, max = 2000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validArtifact(value: unknown): value is Artifact {
  return object(value) && keys(value, ['role', 'file', 'sha256', 'bytes'])
    && ['transaction', 'receipt', 'block'].includes(String(value.role))
    && matches(value.file, /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/)
    && matches(value.sha256, /^[0-9a-f]{64}$/)
    && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0
    && Number(value.bytes) <= MAX_ARTIFACT_BYTES;
}

export function validateManifest(value: unknown, fixtureId: string): FixtureManifest {
  const fail = (): never => { throw new FixtureError('INVALID_MANIFEST'); };
  if (!object(value) || !keys(value, [
    'schema_version', 'fixture_id', 'scenario_id', 'source_kind', 'chain_id', 'description',
    'captured_at', 'source', 'adapter_version', 'decoder_version', 'corpus_snapshot',
    'split', 'capabilities', 'snapshot', 'artifacts',
  ])) return fail();
  if (value.schema_version !== '1.0.0' || value.fixture_id !== fixtureId
    || !matches(value.scenario_id, /^synthetic:[a-z0-9]+(?:-[a-z0-9]+)*$/)
    || value.source_kind !== 'synthetic' || !matches(value.chain_id, /^[1-9][0-9]{0,77}$/)
    || !text(value.description) || !matches(value.captured_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    || !Number.isFinite(Date.parse(value.captured_at))
    || new Date(value.captured_at).toISOString() !== value.captured_at
    || value.adapter_version !== 'fixture-loader/1.0.0' || value.decoder_version !== null
    || value.corpus_snapshot !== null || !['dev', 'test'].includes(String(value.split))) return fail();
  const source = value.source;
  if (!object(source) || !keys(source, ['publisher', 'uri', 'license'])
    || !text(source.publisher) || source.uri !== null || !text(source.license)) return fail();
  const capabilities = value.capabilities;
  if (!object(capabilities) || !keys(capabilities, [
    'receipts', 'logs', 'historical_state', 'safe_finalized', 'trace', 'abi_enrichment',
  ]) || !Object.values(capabilities).every(v => typeof v === 'boolean')) return fail();
  // M0 exposes raw receipts/logs only, never claims live or enrichment capabilities.
  if (capabilities.receipts !== true || capabilities.logs !== true
    || capabilities.historical_state !== false || capabilities.safe_finalized !== false
    || capabilities.trace !== false || capabilities.abi_enrichment !== false) return fail();
  const snapshot = value.snapshot;
  if (!object(snapshot) || !keys(snapshot, ['tx_hash', 'block_hash', 'block_number'])
    || !matches(snapshot.tx_hash, HASH)
    || !(snapshot.block_hash === null || matches(snapshot.block_hash, HASH))
    || !(snapshot.block_number === null || matches(snapshot.block_number, DECIMAL))
    || (snapshot.block_hash === null) !== (snapshot.block_number === null)) return fail();
  if (!Array.isArray(value.artifacts) || value.artifacts.length !== 3
    || !value.artifacts.every(validArtifact)
    || new Set(value.artifacts.map(a => a.role)).size !== 3
    || new Set(value.artifacts.map(a => a.file)).size !== 3
    || value.artifacts.some(a => a.file === 'manifest.json')) return fail();
  return value as unknown as FixtureManifest;
}

export function parseJson(bytes: Uint8Array, kind: 'manifest' | 'payload'): unknown {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // Bound nesting; reject overflowed/unsafe JSON numbers instead of silently rounding them.
    const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.depth > 64 || (typeof item.value === 'number' && !Number.isSafeInteger(item.value))) throw new Error();
      if (item.value !== null && typeof item.value === 'object') {
        for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
      }
    }
    return value;
  } catch {
    throw new FixtureError(kind === 'manifest' ? 'INVALID_MANIFEST' : 'INVALID_PAYLOAD');
  }
}

function rawObject(value: unknown): value is JsonObject {
  return object(value);
}

export function validatePayloads(
  manifest: FixtureManifest, transaction: unknown, receipt: unknown, block: unknown,
): RawPayloads {
  const invalid = (): never => { throw new FixtureError('INVALID_PAYLOAD'); };
  const inconsistent = (): never => { throw new FixtureError('INCONSISTENT_SNAPSHOT'); };
  if (!rawObject(transaction) || !matches(transaction.hash, HASH)
    || !matches(transaction.from, ADDRESS)
    || !(transaction.to === null || matches(transaction.to, ADDRESS))
    || !matches(transaction.value, QUANTITY) || !matches(transaction.nonce, QUANTITY)
    || !matches(transaction.input, /^0x(?:[0-9a-f]{2})*$/)
    || !(transaction.blockHash === null || matches(transaction.blockHash, HASH))
    || !(transaction.blockNumber === null || matches(transaction.blockNumber, QUANTITY))) return invalid();
  if (!(receipt === null || (rawObject(receipt) && matches(receipt.transactionHash, HASH)
    && matches(receipt.blockHash, HASH) && matches(receipt.blockNumber, QUANTITY)
    && (receipt.status === '0x0' || receipt.status === '0x1') && Array.isArray(receipt.logs)))) return invalid();
  if (!(block === null || (rawObject(block) && matches(block.hash, HASH)
    && matches(block.number, QUANTITY) && Array.isArray(block.transactions)
    && block.transactions.every(h => matches(h, HASH))))) return invalid();

  if (transaction.hash !== manifest.snapshot.tx_hash
    || transaction.blockHash !== manifest.snapshot.block_hash
    || (transaction.blockHash === null) !== (transaction.blockNumber === null)) return inconsistent();
  if (transaction.chainId !== undefined && (!matches(transaction.chainId, QUANTITY)
    || BigInt(transaction.chainId).toString() !== manifest.chain_id)) return inconsistent();
  if (transaction.blockNumber !== null
    && BigInt(transaction.blockNumber as string).toString() !== manifest.snapshot.block_number) return inconsistent();
  if (transaction.blockHash === null) {
    if (receipt !== null || block !== null) return inconsistent();
  } else {
    if (block !== null && (block.hash !== transaction.blockHash || block.number !== transaction.blockNumber
      || !(block.transactions as Json[]).includes(transaction.hash))) return inconsistent();
    if (receipt !== null && (block === null || receipt.transactionHash !== transaction.hash
      || receipt.blockHash !== transaction.blockHash || receipt.blockNumber !== transaction.blockNumber)) return inconsistent();
  }
  return { transaction, receipt, block };
}
