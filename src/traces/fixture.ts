import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Evidence } from '../adapters/contracts.js';
import { FixtureError } from '../domain/errors.js';
import { readBounded, requireContained, sha256 } from '../fixtures/loader.js';
import { FIXTURE_ID, MAX_ARTIFACT_BYTES, MAX_MANIFEST_BYTES, parseJson } from '../fixtures/validation.js';

export const TRACE_FIXTURE_DIRECTORY = 'call-traces';
export interface CallTraceManifest {
  schema_version: '1.0.0';
  fixture_id: string;
  source_kind: 'synthetic';
  description: string;
  captured_at: string;
  tracer: 'callTracer';
  chain_id: string;
  snapshot: { tx_hash: string; block_hash: string; block_number: string };
  artifact: { file: 'trace.json'; sha256: string; bytes: number };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function validateManifest(value: unknown, fixtureId: string): CallTraceManifest {
  const ok = object(value) && exactKeys(value, ['schema_version', 'fixture_id', 'source_kind', 'description', 'captured_at',
    'tracer', 'chain_id', 'snapshot', 'artifact'])
    && value.schema_version === '1.0.0' && value.fixture_id === fixtureId && value.source_kind === 'synthetic'
    && typeof value.description === 'string' && value.description.trim().length > 0 && value.description.length <= 2000
    && typeof value.captured_at === 'string' && Number.isFinite(Date.parse(value.captured_at))
    && new Date(value.captured_at).toISOString() === value.captured_at
    && value.tracer === 'callTracer' && typeof value.chain_id === 'string' && /^[1-9][0-9]{0,77}$/.test(value.chain_id)
    && object(value.snapshot) && exactKeys(value.snapshot, ['tx_hash', 'block_hash', 'block_number'])
    && typeof value.snapshot.tx_hash === 'string' && /^0x[0-9a-f]{64}$/.test(value.snapshot.tx_hash)
    && typeof value.snapshot.block_hash === 'string' && /^0x[0-9a-f]{64}$/.test(value.snapshot.block_hash)
    && typeof value.snapshot.block_number === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value.snapshot.block_number)
    && object(value.artifact) && exactKeys(value.artifact, ['file', 'sha256', 'bytes']) && value.artifact.file === 'trace.json'
    && typeof value.artifact.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.artifact.sha256)
    && Number.isSafeInteger(value.artifact.bytes) && Number(value.artifact.bytes) > 0 && Number(value.artifact.bytes) <= MAX_ARTIFACT_BYTES;
  if (!ok) throw new FixtureError('INVALID_MANIFEST');
  return value as unknown as CallTraceManifest;
}

/**
 * Loads `<root>/call-traces/<fixtureId>/` as trace evidence, or returns null when no trace fixture exists.
 * Path containment, bounded reads and checksums reuse the M0 loader rules.
 */
export async function loadCallTraceFixture(root: string, fixtureId: string): Promise<{ manifest: CallTraceManifest; evidence: Evidence } | null> {
  if (fixtureId.length > 100 || !FIXTURE_ID.test(fixtureId)) throw new FixtureError('INVALID_FIXTURE_ID');
  let directory: string;
  try {
    const base = await realpath(resolve(root, TRACE_FIXTURE_DIRECTORY));
    directory = await realpath(resolve(base, fixtureId));
    requireContained(base, directory);
  } catch (error) {
    if (error instanceof FixtureError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new FixtureError('IO_ERROR');
  }
  try {
    const manifestBytes = await readBounded(directory, 'manifest.json', MAX_MANIFEST_BYTES);
    const manifest = validateManifest(parseJson(manifestBytes, 'manifest'), fixtureId);
    const bytes = await readBounded(directory, manifest.artifact.file, MAX_ARTIFACT_BYTES);
    if (bytes.length !== manifest.artifact.bytes || sha256(bytes) !== manifest.artifact.sha256) throw new FixtureError('INTEGRITY_MISMATCH');
    const text = JSON.stringify(parseJson(bytes, 'payload'));
    const evidence: Evidence = { schema_version: '1.0.0', provider_id: 'fixture-loader/1.0.0', method: 'fixture:call_trace',
      params: [sha256(manifestBytes), manifest.artifact.sha256], request_id: 1, captured_at: manifest.captured_at,
      sha256: sha256(text), raw_utf8: text };
    return { manifest, evidence };
  } catch (error) {
    if (error instanceof FixtureError) throw error;
    throw new FixtureError('IO_ERROR');
  }
}
