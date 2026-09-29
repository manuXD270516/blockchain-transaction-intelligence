import { readInvestigation } from './investigation-input.js';
import { AdapterError } from './adapters/contracts.js';
import { FixtureError } from './domain/errors.js';
import { NormalizationError } from './normalization/evidence.js';
import { extractTokenEvents } from './events/extract.js';

const [mode, identifier, ...extra] = process.argv.slice(2);
if (extra.length || !identifier || (mode !== 'fixture' && mode !== 'live')) {
  process.stderr.write('Usage: node dist/extract-cli.js fixture <fixture-id> | live <tx-hash>\n');
  process.exitCode = 2;
} else {
  try {
    const result = extractTokenEvents(await readInvestigation(mode, identifier));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof NormalizationError || error instanceof AdapterError || error instanceof FixtureError
      ? error.code : 'EXTRACTION_ERROR';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    process.exitCode = 1;
  }
}
