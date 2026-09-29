import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderDashboard } from './evals/dashboard.js';
import { compareResults, runEvaluation } from './evals/runner.js';
import type { EvaluationResult } from './evals/runner.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readResult(path: string): Promise<EvaluationResult> {
  const value = JSON.parse(await readFile(path, 'utf8')) as EvaluationResult;
  if (value?.schema_version !== '1.0.0' || typeof value.comparable_key !== 'string') throw new Error('INVALID_RESULT');
  return value;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'run') {
    const repetitions = args[0] === '--repetitions' && args[1] ? Number.parseInt(args[1], 10) : 30;
    if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 1000 || (args.length && args.length !== 2)) throw new Error('INVALID_INPUT');
    const result = await runEvaluation({ root: ROOT, latency_repetitions: repetitions });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.release_blocked) process.exitCode = 1;
  } else if (command === 'compare' && args.length === 2) {
    process.stdout.write(`${JSON.stringify(compareResults(await readResult(args[0]!), await readResult(args[1]!)))}\n`);
  } else if (command === 'dashboard' && args.length === 1) {
    process.stdout.write(renderDashboard(await readResult(args[0]!)));
  } else throw new Error('INVALID_INPUT');
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ error: { code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EVALUATION_FAILED' } })}\n`);
  process.exitCode = 1;
});
