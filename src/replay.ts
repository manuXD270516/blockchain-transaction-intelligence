import type { ReplaySummary, Role } from './domain/types.js';
import { loadFixture, sha256 } from './fixtures/loader.js';

export const REPLAYER_VERSION = 'offline-replay/1.0.0' as const;

export async function replayFixture(root: string, fixtureId: string): Promise<ReplaySummary> {
  const { manifest, manifest_sha256, raw } = await loadFixture(root, fixtureId);
  const missing: Role[] = [];
  if (raw.receipt === null) missing.push('receipt');
  if (raw.block === null) missing.push('block');
  const execution = raw.receipt !== null
    ? raw.receipt.status === '0x1' ? 'success' : 'reverted'
    : raw.transaction.blockHash === null ? 'pending' : 'unknown';
  const hashes = {} as Record<Role, string>;
  for (const artifact of manifest.artifacts) hashes[artifact.role] = artifact.sha256;
  return {
    schema_version: '1.0.0',
    replayer_version: REPLAYER_VERSION,
    replay_id: sha256(`${REPLAYER_VERSION}\n${manifest_sha256}`),
    fixture_id: manifest.fixture_id,
    scenario_id: manifest.scenario_id,
    source_kind: manifest.source_kind,
    chain_id: manifest.chain_id,
    snapshot: { ...manifest.snapshot },
    execution_status: execution,
    coverage: { status: missing.length === 0 ? 'complete' : 'partial', scope: 'transaction-receipt-block', missing },
    raw_log_count: raw.receipt === null ? null : (raw.receipt.logs as readonly unknown[]).length,
    manifest_sha256,
    artifact_sha256: hashes,
    warnings: ['SYNTHETIC_DATA_NOT_A_PUBLIC_TRANSACTION', 'M0_RAW_REPLAY_NOT_A_REVIEWED_ANALYSIS'],
  };
}
