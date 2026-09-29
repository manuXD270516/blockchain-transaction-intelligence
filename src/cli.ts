import { fileURLToPath } from 'node:url';
import { FixtureError } from './domain/errors.js';
import { replayFixture } from './replay.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== 'replay' || !args[1]) {
  process.stderr.write('Usage: node dist/cli.js replay <fixture-id>\n');
  process.exitCode = 2;
} else {
  try {
    const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
    const summary = await replayFixture(root, args[1]);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    const safe = error instanceof FixtureError ? error : new FixtureError('IO_ERROR');
    process.stderr.write(`${JSON.stringify({ error: { code: safe.code, message: safe.message } })}\n`);
    process.exitCode = 1;
  }
}
