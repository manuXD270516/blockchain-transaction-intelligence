import { fileURLToPath } from 'node:url';
import { FixtureAdapter } from './adapters/fixture.js';
import { loadFixture } from './fixtures/loader.js';
import type { Investigation } from './adapters/contracts.js';

export async function readInvestigation(mode: 'fixture' | 'live', identifier: string): Promise<Investigation> {
  if (mode === 'fixture') {
    const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
    const fixture = await loadFixture(root, identifier);
    return new FixtureAdapter(root, identifier).investigate(fixture.manifest.snapshot.tx_hash);
  }
  const { EthereumAdapter } = await import('./adapters/ethereum.js');
  return new EthereumAdapter().investigate(identifier);
}
