import { fileURLToPath } from 'node:url';
import { identifyContractFixture } from './contracts/fixture.js';
import { ContractIdentificationError } from './contracts/identify.js';
import { FixtureError } from './domain/errors.js';

const ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url));
const [mode, identifier, ...extra] = process.argv.slice(2);
if (mode !== 'fixture' || !identifier || extra.length) {
  process.stderr.write('Usage: node dist/contract-cli.js fixture <contract-fixture-id>\n');
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${JSON.stringify(await identifyContractFixture(ROOT, identifier), null, 2)}\n`);
  } catch (error) {
    const code = error instanceof FixtureError || error instanceof ContractIdentificationError ? error.code : 'CONTRACT_IDENTIFICATION_ERROR';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    process.exitCode = 1;
  }
}
