import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { readInvestigation } from './investigation-input.js';
import { ReviewInputError } from './review/evidence.js';
import { RunStore, RunStoreError } from './runs/store.js';
import type { RetentionProfile } from './runs/store.js';
import { Tracer } from './telemetry/tracer.js';

function options(args: string[]): { positional: string[]; store?: string; profile?: RetentionProfile } {
  const positional: string[] = [];
  let store: string | undefined;
  let profile: RetentionProfile | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--store' && args[i + 1] && store === undefined) store = args[++i];
    else if (arg === '--profile' && (args[i + 1] === 'local' || args[i + 1] === 'demo') && profile === undefined) profile = args[++i] as RetentionProfile;
    else if (arg.startsWith('--')) throw new AgentValidationError(['INVALID_INPUT']);
    else positional.push(arg);
  }
  return { positional, ...(store ? { store } : {}), ...(profile ? { profile } : {}) };
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const { positional, store: root, profile } = options(args);
  const store = new RunStore({ ...(root ? { root } : {}), ...(profile ? { profile } : {}) });
  const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
  if (command === 'record' && positional.length === 1) {
    const fixtureId = positional[0]!;
    const investigation = await readInvestigation('fixture', fixtureId);
    const tracer = new Tracer();
    const report = await new BoundedAnalysisOrchestrator({ telemetry: tracer }).runReviewed({
      investigation, question: 'Summarize only the supported transaction evidence.',
    });
    const record = await store.save({ report, trace: tracer.export(), source: { kind: 'fixture', fixture_id: fixtureId } });
    write({ run_id: record.run_id, profile: record.profile, expires_at_ms: record.expires_at_ms, report_status: record.report.status });
  } else if (command === 'list' && positional.length === 0) write(await store.list());
  else if (command === 'get' && positional.length === 1) {
    const record = await store.get(positional[0]!);
    if (!record) throw new AgentValidationError(['RUN_NOT_FOUND']);
    write(record);
  } else if (command === 'delete' && positional.length === 1) write({ deleted: await store.delete(positional[0]!) });
  else if (command === 'sweep' && positional.length === 0) write({ deleted: await store.sweep() });
  else throw new AgentValidationError(['INVALID_INPUT']);
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof RunStoreError || error instanceof FixtureError || error instanceof AdapterError
      || error instanceof ReviewInputError ? error.code : 'RUNS_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
