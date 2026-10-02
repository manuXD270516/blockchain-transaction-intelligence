import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { extractTokenEvents } from './events/extract.js';
import { renderGraphHtml } from './graph/render.js';
import { buildGraphView, MAX_VISUAL_EDGES } from './graph/view.js';
import { readFixtureCallTrace, readInvestigation } from './investigation-input.js';
import { TraceError } from './traces/calltrace.js';

class TraceNotAvailable extends Error {}

async function main(): Promise<void> {
  const [mode, identifier, ...flags] = process.argv.slice(2);
  if (mode !== 'fixture' || !identifier || flags.length > 2 || new Set(flags).size !== flags.length
    || !flags.every(flag => flag === '--json' || flag === '--with-trace')) {
    throw new AgentValidationError(['INVALID_INPUT']);
  }
  const investigation = await readInvestigation('fixture', identifier);
  let trace = null;
  if (flags.includes('--with-trace')) {
    trace = await readFixtureCallTrace(identifier, investigation);
    if (trace === null) throw new TraceNotAvailable();
  }
  const report = await new BoundedAnalysisOrchestrator().runReviewed({ investigation,
    question: 'Summarize only the supported transaction evidence.', call_trace: trace });
  const view = buildGraphView(extractTokenEvents(investigation), report, MAX_VISUAL_EDGES, trace);
  process.stdout.write(flags.includes('--json') ? `${JSON.stringify(view)}\n` : renderGraphHtml(view));
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof TraceNotAvailable ? 'CALL_TRACE_NOT_AVAILABLE'
      : error instanceof FixtureError || error instanceof AdapterError || error instanceof TraceError ? error.code : 'GRAPH_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
