import { AdapterError } from './adapters/contracts.js';
import { AgentValidationError } from './agents/claims.js';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { FixtureError } from './domain/errors.js';
import { readInvestigation } from './investigation-input.js';
import { ReviewInputError } from './review/evidence.js';

async function main(): Promise<void> {
  const [mode, identifier, question] = process.argv.slice(2);
  if (mode !== 'fixture' || !identifier || process.argv.length > 5) throw new AgentValidationError(['INVALID_INPUT']);
  const investigation = await readInvestigation('fixture', identifier);
  const report = await new BoundedAnalysisOrchestrator().runReviewed({
    investigation, question: question ?? 'Summarize only the supported transaction evidence.',
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch(error => {
  const code = error instanceof AgentValidationError ? error.codes[0]
    : error instanceof FixtureError || error instanceof AdapterError || error instanceof ReviewInputError ? error.code : 'REPORT_ERROR';
  process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
  process.exitCode = 1;
});
