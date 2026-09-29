import type { Json } from '../domain/types.js';

export const TOPICS = Object.freeze({
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  single: '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62',
  batch: '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb',
});
export type Standard = 'ERC-20' | 'ERC-721' | 'ERC-1155';
export interface Decoded {
  status: 'decoded' | 'unknown' | 'ambiguous' | 'malformed' | 'limit_exceeded';
  standard_candidate: Standard | null;
  event_name: 'Transfer' | 'TransferSingle' | 'TransferBatch' | null;
  arguments: Record<string, Json> | null;
  reason: string | null;
  reference: string | null;
}
export const MAX_BATCH_ITEMS = 1024;
export const MAX_LOG_BYTES = 128 * 1024;
const WORD = /^0x[0-9a-f]{64}$/;
class DecodeFailure extends Error {
  constructor(readonly reason: string, readonly limited = false) { super(reason); }
}
function requireLayout(ok: boolean, reason: string): asserts ok { if (!ok) throw new DecodeFailure(reason); }
function address(topic: string): string {
  requireLayout(/^0x0{24}[0-9a-f]{40}$/.test(topic), 'NON_CANONICAL_ADDRESS_PADDING');
  return `0x${topic.slice(26)}`;
}
const integer = (word: string) => BigInt(`0x${word}`).toString();
function failure(status: Decoded['status'], reason: string): Decoded {
  return { status, reason, standard_candidate: null, event_name: null, arguments: null, reference: null };
}

export function decodeStandardEvent(topics: readonly string[], data: string): Decoded {
  if (typeof data !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(data)
    || !Array.isArray(topics) || topics.length > 4 || !topics.every(t => WORD.test(t))) return failure('malformed', 'INVALID_LOG_ENCODING');
  if ((data.length - 2) / 2 > MAX_LOG_BYTES) return failure('limit_exceeded', 'LOG_BYTE_LIMIT');
  const signature = topics[0];
  if (!Object.values(TOPICS).includes(signature as typeof TOPICS.transfer)) return failure('unknown', 'UNSUPPORTED_SIGNATURE');
  try {
    if (signature === TOPICS.transfer) {
      const erc20 = topics.length === 3 && data.length === 66;
      const erc721 = topics.length === 4 && data === '0x';
      if (!erc20 && !erc721) return failure('ambiguous', 'SHARED_SIGNATURE_UNSUPPORTED_LAYOUT');
      const from = address(topics[1]!);
      const to = address(topics[2]!);
      return { status: 'decoded', reason: null, event_name: 'Transfer', standard_candidate: erc20 ? 'ERC-20' : 'ERC-721',
        arguments: erc20 ? { from, to, value: integer(data.slice(2)) } : { from, to, token_id: integer(topics[3]!.slice(2)) },
        reference: `https://eips.ethereum.org/EIPS/eip-${erc20 ? '20' : '721'}` };
    }
    requireLayout(topics.length === 4, 'WRONG_TOPIC_COUNT');
    const operator = address(topics[1]!);
    const from = address(topics[2]!);
    const to = address(topics[3]!);
    const encoded = data.slice(2);
    requireLayout(encoded.length % 64 === 0, 'UNALIGNED_DATA');
    const word = (i: number) => encoded.slice(i * 64, (i + 1) * 64);
    let args: Record<string, Json>;
    if (signature === TOPICS.single) {
      requireLayout(encoded.length === 128, 'WRONG_SINGLE_DATA_LENGTH');
      args = { operator, from, to, token_id: integer(word(0)), value: integer(word(1)) };
    } else {
      requireLayout(encoded.length >= 256, 'BATCH_HEAD_TRUNCATED');
      requireLayout(integer(word(0)) === '64', 'INVALID_IDS_OFFSET');
      const countBig = BigInt(`0x${word(2)}`);
      if (countBig > BigInt(MAX_BATCH_ITEMS)) throw new DecodeFailure('BATCH_ITEM_LIMIT', true);
      const count = Number(countBig); // bounded to 1024 before converting or allocating
      requireLayout(BigInt(`0x${word(1)}`) === BigInt(96 + count * 32), 'INVALID_VALUES_OFFSET');
      requireLayout(encoded.length === (4 + count * 2) * 64, 'BATCH_LENGTH_OR_TRAILING_DATA');
      requireLayout(BigInt(`0x${word(3 + count)}`) === countBig, 'BATCH_ARRAY_LENGTH_MISMATCH');
      args = { operator, from, to,
        ids: Array.from({ length: count }, (_, i) => integer(word(3 + i))),
        values: Array.from({ length: count }, (_, i) => integer(word(4 + count + i))) };
    }
    return { status: 'decoded', reason: null, standard_candidate: 'ERC-1155',
      event_name: signature === TOPICS.single ? 'TransferSingle' : 'TransferBatch', arguments: args,
      reference: 'https://eips.ethereum.org/EIPS/eip-1155' };
  } catch (error) {
    if (error instanceof DecodeFailure) return failure(error.limited ? 'limit_exceeded' : 'malformed', error.reason);
    throw error;
  }
}
