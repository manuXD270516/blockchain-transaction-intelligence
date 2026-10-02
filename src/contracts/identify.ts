import * as z from 'zod';
import { sha256 } from '../fixtures/loader.js';
import { canonical } from '../normalization/evidence.js';

export const IDENTIFICATION_VERSION = 'contract-identification/1.0.0';
/** EIP-1967 implementation slot: bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1). */
export const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const HEX64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CODE = /^0x(?:[0-9a-f]{2})*$/;
const WORD = /^0x[0-9a-f]{64}$/;

const abiEvent = z.strictObject({ type: z.literal('event'), name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/),
  inputs: z.array(z.strictObject({ name: z.string().max(64), type: z.string().regex(/^[a-z0-9[\]]{1,32}$/), indexed: z.boolean() })).max(16),
  anonymous: z.boolean() });
const registryEntry = z.strictObject({ code_sha256: z.string().regex(HEX64), name: z.string().min(1).max(100),
  version: z.string().min(1).max(50), abi: z.array(abiEvent).max(64), abi_sha256: z.string().regex(HEX64),
  provenance: z.strictObject({ source_kind: z.literal('synthetic'), publisher: z.string().min(1).max(200), license: z.string().min(1).max(50),
    note: z.string().min(1).max(500) }) });
const registrySchema = z.strictObject({ schema_version: z.literal('1.0.0'), entries: z.array(registryEntry).max(1000) });
export type AbiRegistry = z.infer<typeof registrySchema>;
export type AbiRegistryEntry = z.infer<typeof registryEntry>;

export class ContractIdentificationError extends Error {
  constructor(readonly code: 'INVALID_ABI_REGISTRY' | 'INVALID_CONTRACT_STATE') { super(code); this.name = 'ContractIdentificationError'; }
}

export function validateAbiRegistry(value: unknown): AbiRegistry {
  const parsed = registrySchema.safeParse(value);
  if (!parsed.success) throw new ContractIdentificationError('INVALID_ABI_REGISTRY');
  const hashes = parsed.data.entries.map(entry => entry.code_sha256);
  if (new Set(hashes).size !== hashes.length
    || parsed.data.entries.some(entry => sha256(canonical(entry.abi)) !== entry.abi_sha256)) throw new ContractIdentificationError('INVALID_ABI_REGISTRY');
  return parsed.data;
}

export const EMPTY_ABI_REGISTRY: AbiRegistry = Object.freeze({ schema_version: '1.0.0', entries: [] }) as AbiRegistry;

export interface ContractState {
  chain_id: string;
  address: string;
  block_hash: string;
  /** Bytecode at the address in this block. */
  code: string;
  /** Raw 32-byte value of the EIP-1967 implementation slot in this block; null when it was not read. */
  implementation_slot: string | null;
  /** Bytecode of the implementation in this block; null when there is no implementation or it was not read. */
  implementation_code: string | null;
}

export type ProxyResult = { kind: 'none' } | { kind: 'eip1967'; implementation: string } | { kind: 'unknown'; reason: string };
export type IdentityResult = { status: 'identified'; name: string; version: string; code_sha256: string; abi_sha256: string;
  abi: AbiRegistryEntry['abi']; provenance: AbiRegistryEntry['provenance'] }
  | { status: 'unknown'; reason: 'NO_CODE' | 'NO_REGISTERED_CODE' | 'NO_HISTORICAL_ABI' | 'PROXY_UNRESOLVED' };

export function codeSha256(code: string): string { return sha256(code); }

/** Deterministic identification from block-pinned reads and a provenance-bearing ABI registry. Never infers by address. */
export function identifyContract(state: ContractState, registry: AbiRegistry = EMPTY_ABI_REGISTRY) {
  if (!/^[1-9][0-9]{0,77}$/.test(state.chain_id) || !ADDRESS.test(state.address) || !WORD.test(state.block_hash) || !CODE.test(state.code)
    || (state.implementation_code !== null && !CODE.test(state.implementation_code))
    || (state.implementation_slot !== null && typeof state.implementation_slot !== 'string')) {
    throw new ContractIdentificationError('INVALID_CONTRACT_STATE');
  }
  const checked = validateAbiRegistry(registry);
  const warnings = new Set<string>(['IDENTITY_IS_NOT_A_SECURITY_ASSESSMENT']);
  let proxy: ProxyResult;
  if (state.code === '0x') proxy = { kind: 'none' };
  else if (state.implementation_slot === null) proxy = { kind: 'unknown', reason: 'SLOT_NOT_READ' };
  else if (!WORD.test(state.implementation_slot) || !/^0x0{24}/.test(state.implementation_slot)) proxy = { kind: 'unknown', reason: 'MALFORMED_SLOT' };
  else if (/^0x0{64}$/.test(state.implementation_slot)) proxy = { kind: 'none' };
  else proxy = { kind: 'eip1967', implementation: `0x${state.implementation_slot.slice(26)}` };
  if (proxy.kind === 'unknown') warnings.add('PROXY_STATUS_UNKNOWN');

  let effective: string | null = state.code === '0x' ? null : state.code;
  if (proxy.kind === 'eip1967') {
    effective = state.implementation_code;
    if (effective === null || effective === '0x') warnings.add('IMPLEMENTATION_CODE_UNAVAILABLE');
  }
  const effectiveHash = effective && effective !== '0x' ? codeSha256(effective) : null;
  const match = effectiveHash ? checked.entries.find(entry => entry.code_sha256 === effectiveHash) : undefined;
  let identity: IdentityResult;
  if (state.code === '0x') identity = { status: 'unknown', reason: 'NO_CODE' };
  else if (proxy.kind === 'unknown') identity = { status: 'unknown', reason: 'PROXY_UNRESOLVED' };
  else if (match) identity = { status: 'identified', name: match.name, version: match.version, code_sha256: match.code_sha256,
    abi_sha256: match.abi_sha256, abi: match.abi, provenance: match.provenance };
  else identity = { status: 'unknown', reason: proxy.kind === 'eip1967' ? 'NO_HISTORICAL_ABI' : 'NO_REGISTERED_CODE' };
  if (identity.status === 'unknown') warnings.add('CONTRACT_IDENTITY_UNKNOWN');
  const body = { schema_version: '1.0.0' as const, identification_version: IDENTIFICATION_VERSION, chain_id: state.chain_id,
    address: state.address, block_hash: state.block_hash, code_sha256: codeSha256(state.code), proxy,
    implementation_code_sha256: proxy.kind === 'eip1967' && state.implementation_code !== null ? codeSha256(state.implementation_code) : null,
    identity, registry_sha256: sha256(canonical(checked)), warnings: [...warnings].sort() };
  return { ...body, identification_id: sha256(canonical(body)) };
}

export type ContractIdentification = ReturnType<typeof identifyContract>;
