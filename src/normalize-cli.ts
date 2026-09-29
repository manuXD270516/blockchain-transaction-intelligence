import { readInvestigation } from './investigation-input.js';
import { AdapterError } from './adapters/contracts.js';
import { FixtureError } from './domain/errors.js';
import { NormalizationError } from './normalization/evidence.js';
import { normalizeInvestigation } from './normalization/normalize.js';

const [mode, identifier, ...extra] = process.argv.slice(2);
if (extra.length || !identifier || (mode !== 'fixture' && mode !== 'live')) {
  process.stderr.write('Usage: node dist/normalize-cli.js fixture <fixture-id> | live <tx-hash>\n');
  process.exitCode = 2;
} else {
  try {
    const investigation = await readInvestigation(mode, identifier);
    process.stdout.write(`${JSON.stringify(normalizeInvestigation(investigation), null, 2)}\n`);
  } catch (error) {
    const code = error instanceof NormalizationError || error instanceof AdapterError || error instanceof FixtureError
      ? error.code : 'INVALID_NORMALIZATION_INPUT';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    process.exitCode = 1;
  }
}
