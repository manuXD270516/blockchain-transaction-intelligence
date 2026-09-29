import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { extractTokenEvents } from './events/extract.js';
import { renderGraphHtml } from './graph/render.js';
import { buildGraphView } from './graph/view.js';
import { readInvestigation } from './investigation-input.js';

async function main(): Promise<void> {
  const [mode, identifier, format] = process.argv.slice(2);
  if (mode !== 'fixture' || !identifier || process.argv.length > 5 || (format !== undefined && format !== '--json')) {
    throw new AgentValidationError(['INVALID_INPUT']);
  }
  const investigation = await readInvestigation('fixture', identifier);
  const report = await new BoundedAnalysisOrchestrator().runReviewed({ investigation, question: 'Summarize only the supported transaction evidence.' });
  const view = buildGraphView(extractTokenEvents(investigation), report);
  process.stdout.write(format === '--json' ? `${JSON.stringify(view)}\n` : renderGraphHtml(view));
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof FixtureError || error instanceof AdapterError ? error.code : 'GRAPH_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
