import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { readFixtureCallTrace, readInvestigation } from './investigation-input.js';
import { ReviewInputError } from './review/evidence.js';
import { TraceError } from './traces/calltrace.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const withTrace = args.includes('--with-trace');
  const [mode, identifier, question, ...extra] = args.filter(arg => arg !== '--with-trace');
  if (mode !== 'fixture' || !identifier || extra.length || args.filter(arg => arg === '--with-trace').length > 1) {
    throw new AgentValidationError(['INVALID_INPUT']);
  }
  const investigation = await readInvestigation('fixture', identifier);
  const callTrace = withTrace ? await readFixtureCallTrace(identifier, investigation) : null;
  if (withTrace && callTrace === null) throw new AgentValidationError(['CALL_TRACE_NOT_AVAILABLE']);
  const report = await new BoundedAnalysisOrchestrator().runReviewed({
    investigation, question: question ?? 'Summarize only the supported transaction evidence.', call_trace: callTrace,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof FixtureError || error instanceof AdapterError || error instanceof ReviewInputError || error instanceof TraceError
      ? error.code : 'REPORT_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
