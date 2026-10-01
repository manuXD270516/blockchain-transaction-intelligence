import { fileURLToPath } from 'node:url';
import { FixtureAdapter } from './adapters/fixture.js';
import { loadFixture } from './fixtures/loader.js';
import type { Investigation } from './adapters/contracts.js';
import { buildCallTrace, TraceError } from './traces/calltrace.js';
import type { CallTrace } from './traces/calltrace.js';
import { loadCallTraceFixture } from './traces/fixture.js';

const FIXTURE_ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url));

export async function readInvestigation(mode: 'fixture' | 'live', identifier: string): Promise<Investigation> {
  if (mode === 'fixture') {
    const fixture = await loadFixture(FIXTURE_ROOT, identifier);
    return new FixtureAdapter(FIXTURE_ROOT, identifier).investigate(fixture.manifest.snapshot.tx_hash);
  }
  const { EthereumAdapter } = await import('./adapters/ethereum.js');
  return new EthereumAdapter().investigate(identifier);
}

/** Returns the synthetic call trace bound to a fixture, or null when the fixture has none. */
export async function readFixtureCallTrace(identifier: string, investigation: Investigation, root = FIXTURE_ROOT): Promise<CallTrace | null> {
  const loaded = await loadCallTraceFixture(root, identifier);
  if (loaded === null) return null;
  const { snapshot } = loaded.manifest;
  if (investigation.mode !== 'synthetic' || loaded.manifest.chain_id !== investigation.chain_id
    || investigation.raw.transaction?.hash !== snapshot.tx_hash || investigation.snapshot?.block_hash !== snapshot.block_hash
    || investigation.snapshot.block_number !== snapshot.block_number) throw new TraceError('INCONSISTENT_TRACE');
  return buildCallTrace(investigation, loaded.evidence);
}
