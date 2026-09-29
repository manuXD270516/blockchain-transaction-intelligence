import type { ChainAdapter, Investigation, Evidence } from './contracts.js';
import { match, HASH, requireInput } from './contracts.js';
import { loadFixture, sha256 } from '../fixtures/loader.js';

export class FixtureAdapter implements ChainAdapter {
  constructor(private readonly root: string, private readonly fixtureId: string) {}

  async investigate(txHash: string): Promise<Investigation> {
    requireInput(match(txHash, HASH));
    const fixture = await loadFixture(this.root, this.fixtureId);
    const { manifest, raw } = fixture;
    const evidence: Evidence[] = manifest.artifacts.map((artifact, index) => {
      const text = JSON.stringify(raw[artifact.role]);
      return { schema_version: '1.0.0', provider_id: 'fixture-loader/1.0.0', method: `fixture:${artifact.role}`,
        params: [fixture.manifest_sha256, artifact.sha256], request_id: index + 1, captured_at: manifest.captured_at,
        sha256: sha256(text), raw_utf8: text };
    });
    const found = manifest.snapshot.tx_hash === txHash;
    return {
      schema_version: '1.0.0', mode: 'synthetic', chain_id: manifest.chain_id,
      status: !found ? 'not_found' : raw.receipt === null || raw.block === null ? 'partial' : 'ok',
      execution_status: !found ? 'unknown' : raw.receipt !== null ? raw.receipt.status === '0x1' ? 'success' : 'reverted'
        : raw.transaction.blockHash === null ? 'pending' : 'unknown',
      snapshot: !found || manifest.snapshot.block_hash === null ? null : { chain_id: manifest.chain_id,
        block_hash: manifest.snapshot.block_hash, block_number: manifest.snapshot.block_number!, finality: 'unknown' },
      raw: found ? raw : { transaction: null, receipt: null, block: null },
      capabilities: { receipts: true, logs: true, historical_state: 'unsupported', safe_finalized: 'unsupported',
        trace: 'unsupported', abi_enrichment: 'unsupported' },
      evidence: found ? evidence : [], attempts: [],
      warnings: ['SYNTHETIC_DATA_NOT_A_PUBLIC_TRANSACTION', 'M1_RAW_DATA_NOT_A_REVIEWED_ANALYSIS',
        ...(found && raw.receipt === null ? ['RECEIPT_NOT_AVAILABLE'] : []),
        ...(found && raw.receipt?.status === '0x0' ? ['REVERT_REASON_UNKNOWN'] : [])],
    };
  }
}
