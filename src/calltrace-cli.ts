import { AdapterError } from './adapters/contracts.js';
import { FixtureError } from './domain/errors.js';
import { readFixtureCallTrace, readInvestigation } from './investigation-input.js';
import { NormalizationError } from './normalization/evidence.js';
import { TraceError } from './traces/calltrace.js';

const [mode, identifier, ...extra] = process.argv.slice(2);
if (extra.length || !identifier || mode !== 'fixture') {
  process.stderr.write('Usage: node dist/calltrace-cli.js fixture <fixture-id>\n');
  process.exitCode = 2;
} else {
  try {
    const trace = await readFixtureCallTrace(identifier, await readInvestigation('fixture', identifier));
    if (trace === null) {
      process.stderr.write(`${JSON.stringify({ error: { code: 'CALL_TRACE_NOT_AVAILABLE' } })}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof TraceError || error instanceof FixtureError || error instanceof AdapterError
      || error instanceof NormalizationError ? error.code : 'CALL_TRACE_ERROR';
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    process.exitCode = 1;
  }
}
