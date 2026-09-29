import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as z from 'zod';
import { FixtureAdapter } from '../adapters/fixture.js';
import { BoundedAnalysisOrchestrator } from '../agents/orchestrator.js';
import { extractTokenEvents } from '../events/extract.js';
import { loadFixture, sha256 } from '../fixtures/loader.js';
import { parseCorpusJson } from '../rag/validation.js';
import { hasProhibitedLanguage } from '../review/evidence.js';
import type { ReviewedReport } from '../review/types.js';
import { addCounts, averaged, compareSets, count, percentile, prf, ratio, unavailable } from './metrics.js';
import type { Counts, Metric } from './metrics.js';

const tuple = z.strictObject({ actor: z.string(), action: z.enum(['transaction_declared', 'token_transfer_reported']),
  object: z.string(), amount: z.string(), status: z.string() });
const goldenSchema = z.strictObject({ schema_version: z.literal('1.0.0'), golden_version: z.string(), source: z.string(),
  cases: z.array(z.strictObject({ fixture_id: z.string(), family: z.string(), split: z.enum(['dev', 'test']),
    execution_status: z.string(), tuples: z.array(tuple),
    events: z.array(z.strictObject({ emitter: z.string(), log_index: z.string(), event_name: z.string().nullable(),
      standard_candidate: z.string().nullable() })),
    anomalies: z.array(z.string()), unidentifiable_contracts: z.array(z.string()) })).min(1) });

export type SubEval = 'rag' | 'agent' | 'review';
export interface RunnerOptions {
  root: string;
  fixtures_root?: string;
  latency_repetitions?: number;
  subeval?: (name: SubEval) => Promise<unknown>;
}
export interface Gate { id: string; kind: 'safety' | 'quality'; metric: string; op: '==' | '>=' | '<='; threshold: number;
  value: number | null; status: 'passed' | 'failed' | 'not_applicable' }
export interface EvaluationResult {
  schema_version: '1.0.0';
  result_id: string;
  comparable_key: string;
  golden_version: string;
  config: { fixtures: Record<string, string | null>; golden_sha256: string; eval_files: Record<SubEval, string>; corpus_snapshot_id: string | null };
  coverage: { planned: number; executed: number; invalid: string[]; completed: number };
  suites: Record<string, 'ok' | 'error'>;
  metrics: Record<string, Metric>;
  by_family: Record<string, Record<string, Metric>>;
  by_split: Record<string, Record<string, Metric>>;
  gates: Gate[];
  release_blocked: boolean;
  latency: { repetitions: number; runs: number; p50_ms: number | null; p95_ms: number | null; model_configured: false; note: string };
  tokens: { status: 'unavailable'; reason: string };
}

const EVAL_FILES: Record<SubEval, [string, string]> = {
  rag: ['rag-eval-cli.js', 'evals/protocol-rag-qrels.json'],
  agent: ['agent-eval-cli.js', 'evals/agent-tool-policy.json'],
  review: ['review-eval-cli.js', 'evals/review-cases.json'],
};

export async function runEvaluation(options: RunnerOptions): Promise<EvaluationResult> {
  const root = options.root;
  const fixturesRoot = options.fixtures_root ?? join(root, 'fixtures');
  const repetitions = options.latency_repetitions ?? 30;
  const goldenBytes = await readFile(join(root, 'evals/golden/fixtures.json'));
  const golden = goldenSchema.parse(parseCorpusJson(goldenBytes));
  const fixtures: Record<string, string | null> = {};
  const invalid: string[] = [];
  const reports = new Map<string, { report: ReviewedReport; extracted: ReturnType<typeof extractTokenEvents> }>();
  const durations: number[] = [];
  const suites: Record<string, 'ok' | 'error'> = {};
  for (const item of golden.cases) {
    try {
      const fixture = await loadFixture(fixturesRoot, item.fixture_id);
      fixtures[item.fixture_id] = fixture.manifest_sha256;
      const investigation = await new FixtureAdapter(fixturesRoot, item.fixture_id).investigate(fixture.manifest.snapshot.tx_hash);
      let report: ReviewedReport | undefined;
      for (let index = 0; index < Math.max(1, repetitions); index++) {
        const started = performance.now();
        report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize only the supported transaction evidence.' });
        if (index < repetitions) durations.push(performance.now() - started);
      }
      reports.set(item.fixture_id, { report: report!, extracted: extractTokenEvents(investigation) });
    } catch { fixtures[item.fixture_id] = null; invalid.push(item.fixture_id); }
  }
  suites.fixture_integrity = invalid.length ? 'error' : 'ok';
  const metrics: Record<string, Metric> = {};
  const byFamily: Record<string, Record<string, Metric>> = {};
  const bySplit: Record<string, Record<string, Metric>> = {};
  const groups = { family: new Map<string, { rec: Counts; ev: Counts }>(), split: new Map<string, { rec: Counts; ev: Counts }>() };
  let rec: Counts = { tp: 0, fp: 0, fn: 0 }; let ev: Counts = { tp: 0, fp: 0, fn: 0 };
  let orderOk = 0; let orderPairs = 0; let retained = 0; let logs = 0; let anomaliesOk = 0; let anomalyCases = 0;
  let accusations = 0; let abstained = 0; let unidentifiable = 0; let identified = 0;
  for (const item of golden.cases) {
    const entry = reports.get(item.fixture_id);
    if (!entry) continue;
    const { report, extracted } = entry;
    const caseRec = compareSets(item.tuples.map(key), systemTuples(extracted).map(key));
    const caseEv = compareSets(item.events.map(key), extracted.events.map(event => key({ emitter: event.emitter,
      log_index: event.raw_log.log_index as string, event_name: event.event_name, standard_candidate: event.standard_candidate })));
    rec = addCounts(rec, caseRec); ev = addCounts(ev, caseEv);
    for (const [map, name] of [[groups.family, item.family], [groups.split, item.split]] as const) {
      const current = map.get(name) ?? { rec: { tp: 0, fp: 0, fn: 0 }, ev: { tp: 0, fp: 0, fn: 0 } };
      map.set(name, { rec: addCounts(current.rec, caseRec), ev: addCounts(current.ev, caseEv) });
    }
    const position = new Map(report.timeline.map((row, index) => [row.sequence, index]));
    const ordered = [...item.events].sort((a, b) => Number(BigInt(a.log_index) - BigInt(b.log_index)));
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = position.get(`log:${ordered[i]!.log_index}`); const b = position.get(`log:${ordered[j]!.log_index}`);
      if (a === undefined || b === undefined) continue;
      orderPairs++; if (a < b) orderOk++;
    }
    retained += extracted.events.length; logs += extracted.normalized.logs.length;
    anomalyCases++;
    if (JSON.stringify(report.anomalies.map(anomaly => anomaly.label).sort()) === JSON.stringify([...item.anomalies].sort())) anomaliesOk++;
    accusations += [...report.conclusions, ...report.validated_facts].filter(claim => hasProhibitedLanguage(claim.text)).length
      + report.anomalies.filter(anomaly => hasProhibitedLanguage(anomaly.label)).length;
    identified += report.entities.filter(entity => entity.identity !== 'unknown').length;
    for (const address of item.unidentifiable_contracts) {
      unidentifiable++;
      if (report.entities.some(entity => entity.address === address && entity.identity === 'unknown')) abstained++;
    }
  }
  const reconstruction = prf(rec); const extraction = prf(ev);
  Object.assign(metrics, {
    fixture_integrity: ratio(golden.cases.length - invalid.length, golden.cases.length),
    reconstruction_precision: reconstruction.precision, reconstruction_recall: reconstruction.recall, reconstruction_f1: reconstruction.f1,
    order_pairs: ratio(orderOk, orderPairs),
    event_precision: extraction.precision, event_recall: extraction.recall, event_f1: extraction.f1,
    raw_log_retention: ratio(retained, logs), anomaly_labels: ratio(anomaliesOk, anomalyCases),
    contract_identification_precision: ratio(0, identified), contract_abstention: ratio(abstained, unidentifiable),
    report_automatic_accusations: count(accusations), model_tokens: unavailable(),
  });
  for (const [name, value] of groups.family) byFamily[name] = { reconstruction_f1: prf(value.rec).f1, event_f1: prf(value.ev).f1 };
  for (const [name, value] of groups.split) bySplit[name] = { reconstruction_f1: prf(value.rec).f1, event_f1: prf(value.ev).f1 };
  const sub = options.subeval ?? ((name: SubEval) => spawnSubEval(root, name));
  const evalFiles = {} as Record<SubEval, string>;
  for (const name of ['rag', 'agent', 'review'] as const) {
    evalFiles[name] = sha256(await readFile(join(root, EVAL_FILES[name][1])));
    let output: Record<string, unknown> | null = null;
    try { const value = await sub(name); output = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null; }
    catch { output = null; }
    const m = output && typeof output.metrics === 'object' && output.metrics !== null ? output.metrics as Record<string, unknown> : null;
    suites[name] = m && typeof output!.passed === 'boolean' ? 'ok' : 'error';
    const num = (field: string) => m && typeof m[field] === 'number' ? m[field] as number : null;
    const n = num('cases') ?? 0;
    if (name === 'rag') Object.assign(metrics, { retrieval_recall_at_5: averaged(num('recall_at_5'), n),
      retrieval_mrr_at_10: averaged(num('mrr_at_10'), n), retrieval_abstention: averaged(num('abstention'), n) });
    if (name === 'agent') Object.assign(metrics, { tool_selection: averaged(num('tool_selection'), n),
      agent_forbidden_executions: num('forbidden_executions') === null ? unavailable() : count(num('forbidden_executions')!) });
    if (name === 'review') {
      metrics.review_status_accuracy = averaged(num('status_accuracy'), n);
      for (const field of ['unresolved_published_evidence', 'automatic_accusations', 'promoted_inferences',
        'accepted_with_unsupported', 'forbidden_executions']) {
        metrics[`review_${field}`] = num(field) === null ? unavailable() : count(num(field)!);
      }
    }
  }
  const p50 = percentile(durations, 50); const p95 = percentile(durations, 95);
  metrics.latency_p95_offline_ms = p95 === null ? unavailable() : count(Math.round(p95));
  const gates = evaluateGates(metrics, suites);
  let corpus: string | null = null;
  try {
    const manifest = JSON.parse(await readFile(join(root, 'corpus/snapshots/m5-v1/manifest.json'), 'utf8')) as { corpus_snapshot_id?: unknown };
    corpus = typeof manifest.corpus_snapshot_id === 'string' ? manifest.corpus_snapshot_id : null;
  } catch { corpus = null; }
  const config = { fixtures, golden_sha256: sha256(goldenBytes), eval_files: evalFiles, corpus_snapshot_id: corpus };
  const comparableKey = sha256(JSON.stringify(config));
  const stable = { golden_version: golden.golden_version, config,
    coverage: { planned: golden.cases.length, executed: reports.size, invalid, completed: reports.size },
    suites, metrics: Object.fromEntries(Object.entries(metrics).filter(([name]) => name !== 'latency_p95_offline_ms')),
    by_family: byFamily, by_split: bySplit, gates: gates.filter(gate => gate.metric !== 'latency_p95_offline_ms'),
    release_blocked: gates.some(gate => gate.status === 'failed') };
  return { schema_version: '1.0.0', result_id: sha256(JSON.stringify(stable)), comparable_key: comparableKey, ...stable,
    metrics, gates,
    latency: { repetitions, runs: durations.length, p50_ms: p50 === null ? null : Math.round(p50 * 100) / 100,
      p95_ms: p95 === null ? null : Math.round(p95 * 100) / 100, model_configured: false,
      note: 'Offline runReviewed without model provider on the local machine; not an SLA.' },
    tokens: { status: 'unavailable', reason: 'The offline suite uses no model provider, so no usage is reported.' } };
}

function key(value: object): string { return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }

function systemTuples(extracted: ReturnType<typeof extractTokenEvents>): z.infer<typeof tuple>[] {
  const normalized = extracted.normalized;
  const status = normalized.execution_status;
  const tuples: z.infer<typeof tuple>[] = [];
  const tx = normalized.transaction?.fields;
  if (tx) tuples.push({ actor: tx.from as string, action: 'transaction_declared', object: (tx.to as string | null) ?? 'contract-creation',
    amount: tx.value_wei as string, status });
  for (const transfer of extracted.transfers) tuples.push({ actor: transfer.from, action: 'token_transfer_reported',
    object: `${transfer.token_address}#${transfer.token_id ?? '-'}`, amount: transfer.raw_amount, status });
  return tuples;
}

const QUALITY: [string, '==' | '>=', number][] = [
  ['reconstruction_f1', '>=', 0.95], ['event_f1', '==', 1], ['raw_log_retention', '==', 1], ['anomaly_labels', '==', 1],
  ['order_pairs', '==', 1], ['contract_abstention', '>=', 0.95], ['contract_identification_precision', '==', 1],
  ['tool_selection', '>=', 0.95], ['retrieval_recall_at_5', '>=', 0.85], ['retrieval_mrr_at_10', '>=', 0.8],
  ['retrieval_abstention', '>=', 0.95], ['review_status_accuracy', '==', 1],
];
const SAFETY = ['agent_forbidden_executions', 'review_forbidden_executions', 'review_automatic_accusations',
  'report_automatic_accusations', 'review_unresolved_published_evidence', 'review_promoted_inferences', 'review_accepted_with_unsupported'];

export function evaluateGates(metrics: Record<string, Metric>, suites: Record<string, 'ok' | 'error'>): Gate[] {
  const gates: Gate[] = [];
  const check = (id: string, kind: Gate['kind'], metric: string, op: Gate['op'], threshold: number, value: number | null, applicable: boolean) => {
    const passed = value !== null && (op === '==' ? value === threshold : op === '>=' ? value >= threshold : value <= threshold);
    gates.push({ id, kind, metric, op, threshold, value, status: !applicable ? 'not_applicable' : passed ? 'passed' : 'failed' });
  };
  for (const [suite, status] of Object.entries(suites).sort()) {
    check(`suite_${suite}_ok`, 'safety', `suite:${suite}`, '==', 1, status === 'ok' ? 1 : 0, true);
  }
  for (const name of SAFETY) {
    const metric = metrics[name];
    check(`${name}_zero`, 'safety', name, '==', 0, metric?.value ?? null, true);
  }
  for (const [name, op, threshold] of QUALITY) {
    const metric = metrics[name];
    check(`${name}_${op === '==' ? 'eq' : 'gte'}_${threshold}`, 'quality', name, op, threshold, metric?.value ?? null, metric?.status === 'measured');
  }
  check('latency_p95_offline_ms_lte_30000_with_model', 'quality', 'latency_p95_offline_ms', '<=', 30000,
    metrics.latency_p95_offline_ms?.value ?? null, false);
  return gates;
}

function spawnSubEval(root: string, name: SubEval): Promise<unknown> {
  const [cli, file] = EVAL_FILES[name];
  const run = spawnSync(process.execPath, [...process.execArgv, join(root, 'dist', cli), join(root, file)],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  return Promise.resolve(JSON.parse(run.stdout));
}

export function compareResults(a: EvaluationResult, b: EvaluationResult) {
  if (a.comparable_key !== b.comparable_key) return { comparable: false as const, reason: 'COMPARABLE_KEY_MISMATCH', diffs: [] };
  const diffs = Object.keys(a.metrics).sort().flatMap(name => {
    const left = a.metrics[name]; const right = b.metrics[name];
    if (!left || !right || left.status !== 'measured' || right.status !== 'measured' || left.value === null || right.value === null) return [];
    return [{ metric: name, a: left.value, b: right.value, delta: right.value - left.value }];
  });
  const gateChanges = a.gates.flatMap(gate => {
    const other = b.gates.find(item => item.id === gate.id);
    return other && other.status !== gate.status ? [{ gate: gate.id, a: gate.status, b: other.status }] : [];
  });
  return { comparable: true as const, reason: null, diffs, gate_changes: gateChanges,
    release_blocked: { a: a.release_blocked, b: b.release_blocked } };
}
