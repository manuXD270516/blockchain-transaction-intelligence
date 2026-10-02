import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as z from 'zod';
import { FixtureError } from '../domain/errors.js';
import { readBounded, requireContained, sha256 } from '../fixtures/loader.js';
import { FIXTURE_ID, MAX_ARTIFACT_BYTES, MAX_MANIFEST_BYTES, parseJson } from '../fixtures/validation.js';
import { identifyContract, validateAbiRegistry } from './identify.js';
import type { AbiRegistry, ContractState } from './identify.js';

const HEX64 = /^[0-9a-f]{64}$/;
const manifestSchema = z.strictObject({ schema_version: z.literal('1.0.0'), fixture_id: z.string().regex(FIXTURE_ID),
  source_kind: z.literal('synthetic'), description: z.string().min(1).max(2000), chain_id: z.string().regex(/^[1-9][0-9]{0,77}$/),
  address: z.string().regex(/^0x[0-9a-f]{40}$/), block_hash: z.string().regex(/^0x[0-9a-f]{64}$/),
  block_number: z.string().regex(/^(?:0|[1-9][0-9]*)$/), registry_sha256: z.string().regex(HEX64),
  artifact: z.strictObject({ file: z.literal('state.json'), sha256: z.string().regex(HEX64),
    bytes: z.number().int().min(1).max(MAX_ARTIFACT_BYTES) }) });
const stateSchema = z.strictObject({ code: z.string().regex(/^0x(?:[0-9a-f]{2})*$/), implementation_slot: z.string().nullable(),
  implementation_code: z.string().regex(/^0x(?:[0-9a-f]{2})*$/).nullable() });

async function contractsRoot(root: string): Promise<string> {
  try { return await realpath(resolve(root, 'contracts')); } catch { throw new FixtureError('IO_ERROR'); }
}

export async function loadAbiRegistry(root: string): Promise<{ registry: AbiRegistry; sha256: string }> {
  const base = await contractsRoot(root);
  const bytes = await readBounded(base, 'abi-registry.json', MAX_ARTIFACT_BYTES);
  try { return { registry: validateAbiRegistry(parseJson(bytes, 'payload')), sha256: sha256(bytes) }; }
  catch { throw new FixtureError('INVALID_PAYLOAD'); }
}

/** Loads a synthetic contract-state fixture with M0 path, size and checksum rules, bound to the registry it was made with. */
export async function loadContractFixture(root: string, fixtureId: string) {
  if (fixtureId.length > 100 || !FIXTURE_ID.test(fixtureId)) throw new FixtureError('INVALID_FIXTURE_ID');
  const base = await contractsRoot(root);
  let directory: string;
  try { directory = await realpath(resolve(base, fixtureId)); requireContained(base, directory); }
  catch (error) { throw error instanceof FixtureError ? error : new FixtureError('IO_ERROR'); }
  const parsed = manifestSchema.safeParse(parseJson(await readBounded(directory, 'manifest.json', MAX_MANIFEST_BYTES), 'manifest'));
  if (!parsed.success || parsed.data.fixture_id !== fixtureId) throw new FixtureError('INVALID_MANIFEST');
  const manifest = parsed.data;
  const bytes = await readBounded(directory, manifest.artifact.file, MAX_ARTIFACT_BYTES);
  if (bytes.length !== manifest.artifact.bytes || sha256(bytes) !== manifest.artifact.sha256) throw new FixtureError('INTEGRITY_MISMATCH');
  const state = stateSchema.safeParse(parseJson(bytes, 'payload'));
  if (!state.success) throw new FixtureError('INVALID_PAYLOAD');
  const { registry, sha256: registryHash } = await loadAbiRegistry(root);
  if (registryHash !== manifest.registry_sha256) throw new FixtureError('INTEGRITY_MISMATCH');
  const contractState: ContractState = { chain_id: manifest.chain_id, address: manifest.address, block_hash: manifest.block_hash, ...state.data };
  return { manifest, state: contractState, registry, state_sha256: manifest.artifact.sha256 };
}

export async function identifyContractFixture(root: string, fixtureId: string) {
  const loaded = await loadContractFixture(root, fixtureId);
  return { fixture_id: fixtureId, source_kind: 'synthetic' as const, block_number: loaded.manifest.block_number,
    state_sha256: loaded.state_sha256, ...identifyContract(loaded.state, loaded.registry),
    notice: 'SYNTHETIC_DATA_NOT_A_PUBLIC_CONTRACT' };
}
