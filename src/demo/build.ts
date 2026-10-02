import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { FixtureAdapter } from '../adapters/fixture.js';
import { BoundedAnalysisOrchestrator } from '../agents/orchestrator.js';
import { renderDashboard } from '../evals/dashboard.js';
import { runEvaluation } from '../evals/runner.js';
import type { EvaluationResult } from '../evals/runner.js';
import { extractTokenEvents } from '../events/extract.js';
import { loadFixture, sha256 } from '../fixtures/loader.js';
import { FIXTURE_ID } from '../fixtures/validation.js';
import { buildGraphView } from '../graph/view.js';
import { parseCorpusJson } from '../rag/validation.js';
import type { ReviewedReport } from '../review/types.js';
import { auditSite, renderFixturePage, renderIndex, withNavigation } from './site.js';

export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROTECTED = ['fixtures', 'corpus', 'evals', 'demo', 'src', 'test', 'openspec'];
const NO_URL = (value: string) => !/\b(?:https?|javascript|data|ftp|ws|wss|file|vbscript):/i.test(value) && !/(?:^|[\s(])\/\//.test(value);
const configSchema = z.strictObject({ schema_version: z.literal('1.0.0'), demo_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  fixtures: z.array(z.strictObject({ fixture_id: z.string().max(100).regex(FIXTURE_ID),
    title: z.string().min(1).max(120).refine(NO_URL), lesson: z.string().min(1).max(1000).refine(NO_URL) })).min(1).max(20) });

export class DemoBuildError extends Error {
  constructor(readonly code: 'INVALID_DEMO_CONFIG' | 'INVALID_DEMO_FIXTURE' | 'RELEASE_BLOCKED' | 'UNSAFE_OUTPUT'
    | 'UNSAFE_OUTPUT_DIR' | 'OUTPUT_DIR_NOT_EMPTY', readonly problems: string[] = []) { super(code); }
}

export interface DemoBuildOptions {
  root?: string;
  out?: string;
  config?: string;
  fixtures_root?: string;
  evaluate?: () => Promise<EvaluationResult>;
}

export interface DemoManifest {
  schema_version: '1.0.0';
  demo_version: string;
  evaluation_result_id: string;
  fixtures: Record<string, string>;
  files: Record<string, string>;
}

export async function renderDemo(options: DemoBuildOptions = {}): Promise<{ files: Map<string, string>; manifest: DemoManifest }> {
  const root = resolve(options.root ?? PROJECT_ROOT);
  const fixturesRoot = options.fixtures_root ?? join(root, 'fixtures');
  let config: z.infer<typeof configSchema>;
  try { config = configSchema.parse(parseCorpusJson(await readFile(options.config ?? join(root, 'demo/fixtures.json')))); }
  catch { throw new DemoBuildError('INVALID_DEMO_CONFIG'); }
  if (new Set(config.fixtures.map(item => item.fixture_id)).size !== config.fixtures.length) throw new DemoBuildError('INVALID_DEMO_CONFIG');
  const evaluation = await (options.evaluate ?? (() => runEvaluation({ root, latency_repetitions: 1 })))();
  if (evaluation.release_blocked) {
    throw new DemoBuildError('RELEASE_BLOCKED', evaluation.gates.filter(gate => gate.status === 'failed').map(gate => gate.id));
  }
  const files = new Map<string, string>();
  const reports = new Map<string, ReviewedReport>();
  const fixtureHashes: Record<string, string> = {};
  for (const entry of config.fixtures) {
    let investigation;
    try {
      const fixture = await loadFixture(fixturesRoot, entry.fixture_id);
      fixtureHashes[entry.fixture_id] = fixture.manifest_sha256;
      investigation = await new FixtureAdapter(fixturesRoot, entry.fixture_id).investigate(fixture.manifest.snapshot.tx_hash);
    } catch { throw new DemoBuildError('INVALID_DEMO_FIXTURE', [entry.fixture_id]); }
    const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({
      investigation, question: 'Summarize only the supported transaction evidence.' });
    reports.set(entry.fixture_id, report);
    files.set(`fixtures/${entry.fixture_id}.html`, renderFixturePage(entry, report, buildGraphView(extractTokenEvents(investigation), report)));
  }
  files.set('index.html', renderIndex(config.fixtures, reports, evaluation, config.demo_version));
  files.set('evaluation.html', withNavigation(renderDashboard({ ...evaluation,
    latency: { ...evaluation.latency, p50_ms: null, p95_ms: null, runs: 0,
      note: 'Latency is omitted from the published demo so the build is reproducible; run npm run eval locally.' } })));
  const problems = auditSite(files);
  if (problems.length) throw new DemoBuildError('UNSAFE_OUTPUT', problems);
  const manifest: DemoManifest = { schema_version: '1.0.0', demo_version: config.demo_version, evaluation_result_id: evaluation.result_id,
    fixtures: fixtureHashes, files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, html]) => [path, sha256(html)])) };
  return { files, manifest };
}

export async function buildDemo(options: DemoBuildOptions = {}): Promise<DemoManifest> {
  const root = resolve(options.root ?? PROJECT_ROOT);
  const out = resolve(options.out ?? join(root, 'dist-demo'));
  assertSafeOutput(out, root);
  await assertReplaceable(out);
  const { files, manifest } = await renderDemo(options);
  await rm(out, { recursive: true, force: true });
  for (const [path, html] of files) {
    const target = join(out, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Re-reads a built site from disk and checks manifest hashes, exact file set and the active-content audit. Offline. */
export async function verifyDemoOutput(out: string): Promise<DemoManifest> {
  const problems: string[] = [];
  let manifest: DemoManifest;
  try {
    manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as DemoManifest;
  } catch { throw new DemoBuildError('UNSAFE_OUTPUT', ['manifest.json: missing or invalid']); }
  if (manifest?.schema_version !== '1.0.0' || typeof manifest.files !== 'object' || manifest.files === null
    || typeof manifest.evaluation_result_id !== 'string') throw new DemoBuildError('UNSAFE_OUTPUT', ['manifest.json: invalid schema']);
  const present: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else if (entry.isFile()) present.push(path);
      else problems.push(`${path}: not a regular file`);
    }
  };
  await walk(out, '');
  const expected = new Set([...Object.keys(manifest.files), 'manifest.json']);
  for (const path of present) if (!expected.has(path)) problems.push(`${path}: not listed in manifest`);
  const files = new Map<string, string>();
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!present.includes(path)) { problems.push(`${path}: missing`); continue; }
    const html = await readFile(join(out, path), 'utf8');
    if (sha256(html) !== hash) problems.push(`${path}: hash mismatch`);
    files.set(path, html);
  }
  problems.push(...auditSite(files));
  if (problems.length) throw new DemoBuildError('UNSAFE_OUTPUT', problems.sort());
  return manifest;
}

function inside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function assertSafeOutput(out: string, root: string): void {
  if (inside(root, out)) throw new DemoBuildError('UNSAFE_OUTPUT_DIR');
  for (const name of PROTECTED) if (inside(out, join(root, name))) throw new DemoBuildError('UNSAFE_OUTPUT_DIR');
}

async function assertReplaceable(out: string): Promise<void> {
  let entries: string[];
  try { entries = await readdir(out); } catch { return; }
  if (!entries.length) return;
  try {
    const previous = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Partial<DemoManifest>;
    if (previous.schema_version === '1.0.0' && typeof previous.evaluation_result_id === 'string' && typeof previous.files === 'object') return;
  } catch { /* fall through */ }
  throw new DemoBuildError('OUTPUT_DIR_NOT_EMPTY');
}
