import { readFile } from 'node:fs/promises';
import * as z from 'zod';
import { parseCorpusJson } from './rag/validation.js';
import { HybridProtocolSearch } from './rag/retrieval.js';

const qrelsSchema = z.strictObject({
  schema_version: z.literal('1.0.0'),
  corpus_snapshot_id: z.string().regex(/^[0-9a-f]{64}$/),
  cases: z.array(z.strictObject({
    id: z.string().min(1), kind: z.enum(['positive', 'incompatible-version', 'negative', 'injection']),
    query: z.string().min(1).max(2000), protocol: z.string().optional(), version: z.string().optional(),
    relevant_document_ids: z.array(z.string()).max(20),
  })).min(1),
});

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error('INVALID_INPUT');
  const parsed = qrelsSchema.safeParse(parseCorpusJson(await readFile(path)));
  if (!parsed.success) throw new Error('INVALID_QRELS');
  const search = new HybridProtocolSearch();
  let recalled = 0; let reciprocal = 0; let abstained = 0; let versionSafe = true;
  const results = [];
  for (const item of parsed.data.cases) {
    const result = await search.search({ query: item.query, top_k: 10,
      ...(item.protocol === undefined ? {} : { protocol: item.protocol }),
      ...(item.version === undefined ? {} : { version: item.version }) });
    if (result.corpus_snapshot_id !== parsed.data.corpus_snapshot_id) throw new Error('SNAPSHOT_MISMATCH');
    const ranks = item.relevant_document_ids.map(id => result.hits.findIndex(hit => hit.document_id === id) + 1).filter(rank => rank > 0);
    const best = ranks.length ? Math.min(...ranks) : 0;
    if (item.kind !== 'injection' && item.relevant_document_ids.length && best > 0 && best <= 5) recalled++;
    if (item.kind !== 'injection' && best) reciprocal += 1 / best;
    if (!item.relevant_document_ids.length && !result.hits.length) abstained++;
    if (item.version && result.hits.some(hit => hit.compatibility === 'conflicting'
      && item.relevant_document_ids.includes(hit.document_id))) versionSafe = false;
    results.push({ id: item.id, best_rank: best || null, hits: result.hits.length });
  }
  const answerable = parsed.data.cases.filter(item => item.kind !== 'injection' && item.relevant_document_ids.length).length;
  const negatives = parsed.data.cases.filter(item => item.kind === 'negative').length;
  const metrics = { recall_at_5: answerable ? recalled / answerable : 1, mrr_at_10: answerable ? reciprocal / answerable : 1,
    abstention: negatives ? abstained / negatives : 1, version_safe: versionSafe, cases: parsed.data.cases.length };
  const passed = metrics.recall_at_5 >= 0.85 && metrics.mrr_at_10 >= 0.75 && metrics.abstention === 1 && versionSafe;
  process.stdout.write(`${JSON.stringify({ schema_version: '1.0.0', passed, metrics, results })}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write(`${JSON.stringify({ error: { code: 'EVALUATION_FAILED' } })}\n`);
  process.exitCode = 1;
});
