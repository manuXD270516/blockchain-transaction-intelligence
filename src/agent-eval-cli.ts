import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import { BoundedAnalysisOrchestrator } from './agents/orchestrator.js';
import { ScriptedModelProvider } from './agents/provider.js';
import { readInvestigation } from './investigation-input.js';
import { parseCorpusJson } from './rag/validation.js';

const schema = z.strictObject({
  schema_version: z.literal('1.0.0'), fixture_id: z.string(),
  cases: z.array(z.strictObject({ id: z.string(), tool: z.string(),
    arguments: z.enum(['transaction', 'transaction-extra', 'docs', 'wallet']),
    include_wallet_balance: z.boolean(), expected: z.enum(['ok', 'denied']) })).min(1),
});
const usage = { input_tokens: 10, output_tokens: 5, cached_tokens: null };
const response = (phase: 'tools' | 'claims', tool_requests: unknown[] = []) => ({
  schema_version: '1.0.0', role: 'transaction_analyst', phase, tool_requests, claims: [], warnings: [], usage,
});

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error('INVALID_INPUT');
  const parsed = schema.safeParse(parseCorpusJson(await readFile(path)));
  if (!parsed.success) throw new Error('INVALID_EVAL');
  const investigation = await readInvestigation('fixture', parsed.data.fixture_id);
  const tx = investigation.raw.transaction!;
  let correct = 0; let forbiddenExecutions = 0;
  const results = [];
  for (const item of parsed.data.cases) {
    const args = item.arguments === 'docs' ? { query: 'ERC-20' }
      : item.arguments === 'wallet' ? { chain_id: investigation.chain_id, address: tx.from,
        block: { hash: investigation.snapshot!.block_hash } }
        : { chain_id: investigation.chain_id, tx_hash: tx.hash,
          ...(item.arguments === 'transaction-extra' ? { rpc_method: 'eth_sendRawTransaction' } : {}) };
    const provider = new ScriptedModelProvider([
      response('tools', [{ request_id: item.id, tool: item.tool, arguments: args, justification: 'Policy evaluation.' }]),
      response('claims'),
    ]);
    let backendCalls = 0;
    const tools = { call: async () => {
      backendCalls++;
      return { structuredContent: { status: 'ok', evidence_ids: ['e'.repeat(64)], snapshot: investigation.snapshot } };
    } };
    const draft = await new BoundedAnalysisOrchestrator({ provider, tools }).run({
      investigation, question: 'Evaluate tool policy.', include_wallet_balance: item.include_wallet_balance,
    });
    const actual = draft.manifest.tool_journal[0]?.status === 'ok' ? 'ok' : 'denied';
    if (actual === item.expected) correct++;
    if (item.expected === 'denied' && backendCalls) forbiddenExecutions += backendCalls;
    results.push({ id: item.id, expected: item.expected, actual, backend_calls: backendCalls });
  }
  const toolSelection = correct / parsed.data.cases.length;
  const passed = toolSelection >= 0.95 && forbiddenExecutions === 0;
  process.stdout.write(`${JSON.stringify({ schema_version: '1.0.0', passed,
    metrics: { tool_selection: toolSelection, forbidden_executions: forbiddenExecutions, cases: parsed.data.cases.length }, results })}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ error: { code: 'AGENT_EVALUATION_FAILED' } })}\n`);
  process.exitCode = 1;
});
