import type { Investigation } from '../adapters/contracts.js';
import { ADDRESS, HASH, QUANTITY, match, record } from '../adapters/contracts.js';
import type { Json, JsonObject } from '../domain/types.js';
import { sha256 } from '../fixtures/loader.js';
import { canonical, check, EvidenceBuilder, freeze } from './evidence.js';

const VERSION = 'canonical-transaction/1.0.0';
const HEX = /^0x(?:[0-9a-f]{2})*$/;
type FieldMap = Record<string, Json>;
export interface CanonicalEntity {
  schema_version: '1.0.0';
  id: string;
  fields: FieldMap;
  raw_evidence_id: string;
  normalization_evidence_id: string;
}

export function decimal(value: unknown): string {
  check(match(value, QUANTITY));
  return BigInt(value).toString(10);
}
function optionalQuantity(raw: JsonObject, key: string): string | null {
  return raw[key] == null ? null : decimal(raw[key]);
}
function required(raw: JsonObject, key: string, pattern: RegExp): string {
  const value = raw[key]; check(match(value, pattern)); return value;
}
function optionalData(raw: JsonObject, key: string, pattern: RegExp): string | null {
  return raw[key] == null ? null : required(raw, key, pattern);
}

export function normalizeInvestigation(input: Investigation) {
  check(input.schema_version === '1.0.0' && ['synthetic', 'testnet_live'].includes(input.mode)
    && match(input.chain_id, /^[1-9][0-9]{0,77}$/) && record(input.raw)
    && Array.isArray(input.evidence) && input.evidence.length <= 24 && Array.isArray(input.warnings));
  const raw = structuredClone(input.raw);
  for (const value of Object.values(raw)) check(value === null || record(value));
  const evidence = new EvidenceBuilder(input);
  const warnings = new Set(input.warnings);
  warnings.add('M2_CANONICAL_DATA_NOT_A_REVIEWED_ANALYSIS');
  const chain = input.chain_id;
  const tx = raw.transaction;
  const rec = raw.receipt;
  const blk = raw.block;
  const mismatch = (ok: boolean) => check(ok, 'INCONSISTENT_NORMALIZATION_SNAPSHOT');
  const atIndex = (items: readonly Json[], index: string, hash: string): void => {
    const integer = BigInt(index);
    // Conversion is used only for an already-bounded array offset, never for a chain quantity.
    mismatch(integer < BigInt(items.length));
    mismatch(items[Number(integer)] === hash);
  };
  let transaction: CanonicalEntity | null = null;
  let receipt: CanonicalEntity | null = null;
  let block: CanonicalEntity | null = null;
  const logs: CanonicalEntity[] = [];
  let execution: Investigation['execution_status'] = 'unknown';
  const entities = new Map<string, { rawId: string; prefix: string }>();

  function entity(role: 'transaction' | 'receipt' | 'block', id: string, fields: FieldMap, mapping: Record<string, string>): CanonicalEntity {
    const source = evidence.source(role, raw[role]);
    // An absent optional field has no field citation; the raw parent supports the absence.
    const locators = Object.fromEntries(Object.entries(mapping).map(([key, pointer]) => [key,
      Object.hasOwn(raw[role]!, pointer.slice(1)) ? [`${source.prefix}${pointer}`] : []]));
    entities.set(role, { rawId: source.node.evidence_id, prefix: source.prefix });
    return { schema_version: '1.0.0', id, fields, raw_evidence_id: source.node.evidence_id,
      normalization_evidence_id: evidence.derive(fields, [source.node.evidence_id], locators, VERSION) };
  }

  if (tx === null) {
    mismatch(rec === null && blk === null && input.snapshot === null && input.status === 'not_found');
    if (input.mode === 'testnet_live') evidence.source('transaction', null);
    else warnings.add('NO_MATCH_WITHIN_FIXTURE_NOT_PROOF_OF_NONEXISTENCE');
  } else {
    const hash = required(tx, 'hash', HASH);
    const blockHash = optionalData(tx, 'blockHash', HASH);
    const blockNumber = optionalQuantity(tx, 'blockNumber');
    check(Object.hasOwn(tx, 'blockHash') && Object.hasOwn(tx, 'blockNumber') && Object.hasOwn(tx, 'to'));
    mismatch((blockHash === null) === (blockNumber === null));
    if (tx.chainId !== undefined) mismatch(decimal(tx.chainId) === chain);
    if (blockHash === null) mismatch(rec === null && blk === null && input.snapshot === null);
    else mismatch(input.snapshot !== null && input.snapshot.chain_id === chain
      && input.snapshot.block_hash === blockHash && input.snapshot.block_number === blockNumber
      && ['unknown', 'safe', 'finalized'].includes(input.snapshot.finality));
    const fields: FieldMap = {
      hash, from: required(tx, 'from', ADDRESS), to: optionalData(tx, 'to', ADDRESS),
      nonce: decimal(tx.nonce), value_wei: decimal(tx.value), input: required(tx, 'input', HEX),
      type: optionalQuantity(tx, 'type'), gas_limit: optionalQuantity(tx, 'gas'), gas_price_wei: optionalQuantity(tx, 'gasPrice'),
      max_fee_per_gas_wei: optionalQuantity(tx, 'maxFeePerGas'), max_priority_fee_per_gas_wei: optionalQuantity(tx, 'maxPriorityFeePerGas'),
      max_fee_per_blob_gas_wei: optionalQuantity(tx, 'maxFeePerBlobGas'), block_hash: blockHash, block_number: blockNumber,
      transaction_index: optionalQuantity(tx, 'transactionIndex'), is_creation: tx.to === null,
    };
    if (fields.type !== null && !['0', '1', '2', '3'].includes(fields.type as string)) warnings.add('UNKNOWN_TRANSACTION_TYPE');
    transaction = entity('transaction', `${chain}:${hash}:${blockHash ?? 'pending'}`, fields, {
      hash: '/hash', from: '/from', to: '/to', nonce: '/nonce', value_wei: '/value', input: '/input', type: '/type',
      gas_limit: '/gas', gas_price_wei: '/gasPrice', max_fee_per_gas_wei: '/maxFeePerGas',
      max_priority_fee_per_gas_wei: '/maxPriorityFeePerGas', max_fee_per_blob_gas_wei: '/maxFeePerBlobGas',
      block_hash: '/blockHash', block_number: '/blockNumber', transaction_index: '/transactionIndex', is_creation: '/to',
    });
    if (blk !== null) {
      mismatch(required(blk, 'hash', HASH) === blockHash && decimal(blk.number) === blockNumber);
      check(Array.isArray(blk.transactions) && blk.transactions.every(h => match(h, HASH)));
      mismatch(blk.transactions.includes(hash));
      if (fields.transaction_index !== null) atIndex(blk.transactions, fields.transaction_index as string, hash);
      block = entity('block', `${chain}:${blockHash}`, {
        hash: blockHash, parent_hash: required(blk, 'parentHash', HASH), number: blockNumber,
        timestamp_unix_seconds: decimal(blk.timestamp), gas_used: optionalQuantity(blk, 'gasUsed'), gas_limit: optionalQuantity(blk, 'gasLimit'),
        base_fee_per_gas_wei: optionalQuantity(blk, 'baseFeePerGas'), transaction_hashes: blk.transactions,
      }, { hash: '/hash', parent_hash: '/parentHash', number: '/number', timestamp_unix_seconds: '/timestamp',
        gas_used: '/gasUsed', gas_limit: '/gasLimit', base_fee_per_gas_wei: '/baseFeePerGas', transaction_hashes: '/transactions' });
    }
    if (rec === null) execution = blockHash === null ? 'pending' : 'unknown';
    else {
      mismatch(required(rec, 'transactionHash', HASH) === hash && required(rec, 'blockHash', HASH) === blockHash
        && decimal(rec.blockNumber) === blockNumber);
      check(rec.status === '0x0' || rec.status === '0x1');
      execution = rec.status === '0x1' ? 'success' : 'reverted';
      const receiptIndex = optionalQuantity(rec, 'transactionIndex');
      if (receiptIndex !== null && fields.transaction_index !== null) mismatch(receiptIndex === fields.transaction_index);
      if (receiptIndex !== null && blk !== null) atIndex(blk.transactions as readonly Json[], receiptIndex, hash);
      const contract = optionalData(rec, 'contractAddress', ADDRESS);
      mismatch(contract === null || (tx.to === null && execution === 'success'));
      receipt = entity('receipt', `${chain}:${hash}:${blockHash}:receipt`, {
        transaction_hash: hash, block_hash: blockHash, block_number: blockNumber, transaction_index: receiptIndex,
        status: execution, gas_used: optionalQuantity(rec, 'gasUsed'), cumulative_gas_used: optionalQuantity(rec, 'cumulativeGasUsed'),
        effective_gas_price_wei: optionalQuantity(rec, 'effectiveGasPrice'), contract_address: contract,
        blob_gas_used: optionalQuantity(rec, 'blobGasUsed'), blob_gas_price_wei: optionalQuantity(rec, 'blobGasPrice'),
      }, { transaction_hash: '/transactionHash', block_hash: '/blockHash', block_number: '/blockNumber', transaction_index: '/transactionIndex',
        status: '/status', gas_used: '/gasUsed', cumulative_gas_used: '/cumulativeGasUsed', effective_gas_price_wei: '/effectiveGasPrice',
        contract_address: '/contractAddress', blob_gas_used: '/blobGasUsed', blob_gas_price_wei: '/blobGasPrice' });
      check(Array.isArray(rec.logs));
      const seen = new Set<string>();
      for (const [position, log] of rec.logs.entries()) {
        check(record(log));
        const index = decimal(log.logIndex);
        mismatch(!seen.has(index)); seen.add(index);
        mismatch(required(log, 'transactionHash', HASH) === hash && required(log, 'blockHash', HASH) === blockHash
          && decimal(log.blockNumber) === blockNumber && log.removed === false);
        const transactionIndex = decimal(log.transactionIndex);
        if (receiptIndex !== null) mismatch(transactionIndex === receiptIndex);
        if (fields.transaction_index !== null) mismatch(transactionIndex === fields.transaction_index);
        if (blk !== null) atIndex(blk.transactions as readonly Json[], transactionIndex, hash);
        check(Array.isArray(log.topics) && log.topics.length <= 4 && log.topics.every(t => match(t, HASH)));
        const logFields = { address: required(log, 'address', ADDRESS), topics: log.topics, data: required(log, 'data', HEX),
          transaction_hash: hash, block_hash: blockHash, block_number: blockNumber, log_index: index, transaction_index: transactionIndex, removed: false };
        const parent = entities.get('receipt')!;
        logs.push({ schema_version: '1.0.0', id: `${chain}:${hash}:${blockHash}:log:${index}`, fields: logFields,
          raw_evidence_id: parent.rawId, normalization_evidence_id: evidence.derive(logFields, [parent.rawId],
            { log: [`${parent.prefix}/logs/${position}`] }, `${VERSION}:log`) });
      }
    }
    const expected = rec === null || blk === null ? 'partial' : 'ok';
    mismatch(input.status === expected);
    if (rec === null && input.mode === 'testnet_live') evidence.source('receipt', null);
  }
  mismatch(input.execution_status === execution);
  evidence.verifySnapshot();
  if (execution === 'reverted') warnings.add('REVERT_REASON_UNKNOWN');

  const fees = { unit: 'wei', execution_fee_wei: null as string | null, blob_fee_wei: null as string | null,
    total_fee_wei: null as string | null, evidence_ids: { execution: null as string | null, blob: null as string | null, total: null as string | null } };
  if (receipt && transaction) {
    const fields = receipt.fields;
    const source = entities.get('receipt')!;
    for (const [kind, used, price, rawUsed, rawPrice] of [
      ['execution', 'gas_used', 'effective_gas_price_wei', 'gasUsed', 'effectiveGasPrice'],
      ['blob', 'blob_gas_used', 'blob_gas_price_wei', 'blobGasUsed', 'blobGasPrice'],
    ] as const) {
      if (fields[used] !== null && fields[price] !== null) {
        const value = (BigInt(fields[used] as string) * BigInt(fields[price] as string)).toString();
        fees[`${kind}_fee_wei`] = value;
        fees.evidence_ids[kind] = evidence.derive(value, [source.rawId],
          { factors: [`${source.prefix}/${rawUsed}`, `${source.prefix}/${rawPrice}`] }, 'fee-multiply/1.0.0');
      }
    }
    const type = transaction.fields.type;
    const knownKeys = new Set(['effectiveGasPrice', 'blobGasUsed', 'blobGasPrice']);
    const extraFeeFields = Object.keys(rec!).some(k => /fee|gasprice/i.test(k) && !knownKeys.has(k));
    const executionOnly = ['0', '1', '2'].includes(String(type)) && fields.blob_gas_used === null && fields.blob_gas_price_wei === null;
    if (['31337', '11155111'].includes(chain) && !extraFeeFields && fees.execution_fee_wei !== null && (executionOnly || (type === '3' && fees.blob_fee_wei !== null))) {
      fees.total_fee_wei = (BigInt(fees.execution_fee_wei) + BigInt(fees.blob_fee_wei ?? '0')).toString();
      fees.evidence_ids.total = evidence.derive(fees.total_fee_wei,
        [fees.evidence_ids.execution!, ...(fees.evidence_ids.blob ? [fees.evidence_ids.blob] : []), transaction.normalization_evidence_id],
        { type: ['/type'] }, 'ethereum-fee-total/1.0.0');
    } else warnings.add('TOTAL_FEE_UNKNOWN');
  } else warnings.add('TOTAL_FEE_UNKNOWN');
  const missing = (['transaction', 'receipt', 'block'] as const).filter(role => raw[role] === null);
  const body = { schema_version: '1.0.0', normalizer_version: VERSION, mode: input.mode, chain_id: chain,
    snapshot: structuredClone(input.snapshot), acquisition_status: input.status, execution_status: execution,
    coverage: { scope: 'transaction-receipt-block-raw-logs', status: missing.length ? 'partial' : 'complete', missing },
    transaction, receipt, block, logs, fees, raw, evidence: evidence.nodes, warnings: [...warnings].sort() };
  return freeze({ ...body, bundle_id: sha256(canonical(body)) });
}
