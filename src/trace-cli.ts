import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { readInvestigation } from './investigation-input.js';
import { ReviewInputError } from './review/evidence.js';
import { toOtlpJson, Tracer } from './telemetry/tracer.js';

async function main(): Promise<void> {
  const [mode, identifier, flag, ...rest] = process.argv.slice(2);
  if (mode !== 'fixture' || !identifier || (flag !== undefined && flag !== '--otlp') || rest.length) {
    throw new AgentValidationError(['INVALID_INPUT']);
  }
  const investigation = await readInvestigation('fixture', identifier);
  const tracer = new Tracer();
  await new BoundedAnalysisOrchestrator({ telemetry: tracer }).runReviewed({
    investigation, question: 'Summarize only the supported transaction evidence.',
  });
  const trace = tracer.export();
  process.stdout.write(`${JSON.stringify(flag === '--otlp' ? toOtlpJson(trace) : trace)}\n`);
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof FixtureError || error instanceof AdapterError || error instanceof ReviewInputError ? error.code : 'TRACE_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
