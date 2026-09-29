import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReviewedReport } from '../review/types.js';
import { redact } from '../telemetry/redact.js';
import type { TraceRecord } from '../telemetry/tracer.js';

export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULT_STORE_ROOT = join(PROJECT_ROOT, '.runs');
export const RETENTION_MS = Object.freeze({ local: 30 * 24 * 60 * 60 * 1000, demo: 24 * 60 * 60 * 1000 });
const MIN_RETENTION_MS = 60 * 1000;
const MAX_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const PROTECTED = ['fixtures', 'corpus', 'evals', 'demo'];
const RUN_ID = /^[0-9a-f]{32}$/;

export type RetentionProfile = keyof typeof RETENTION_MS;
export class RunStoreError extends Error {
  constructor(readonly code: 'UNSAFE_STORE_ROOT' | 'INVALID_RUN_ID' | 'INVALID_RETENTION' | 'INVALID_RECORD') { super(code); }
}

export interface RunRecord {
  schema_version: '1.0.0';
  run_id: string;
  profile: RetentionProfile;
  created_at_ms: number;
  expires_at_ms: number;
  source: { kind: 'fixture'; fixture_id: string };
  report: ReviewedReport;
  trace: TraceRecord;
}

export interface RunSummary { run_id: string; profile: RetentionProfile | null; created_at_ms: number | null;
  expires_at_ms: number | null; expired: boolean; corrupt: boolean; report_status: string | null }

export interface RunStoreOptions {
  root?: string;
  profile?: RetentionProfile;
  retention_ms?: number;
  now?: () => number;
  project_root?: string;
}

export class RunStore {
  readonly root: string;
  readonly profile: RetentionProfile;
  readonly retention_ms: number;
  private readonly now: () => number;

  constructor(options: RunStoreOptions = {}) {
    this.root = resolve(options.root ?? DEFAULT_STORE_ROOT);
    assertSafeRoot(this.root, resolve(options.project_root ?? PROJECT_ROOT));
    this.profile = options.profile ?? 'local';
    this.retention_ms = options.retention_ms ?? RETENTION_MS[this.profile];
    if (!Number.isSafeInteger(this.retention_ms) || this.retention_ms < MIN_RETENTION_MS || this.retention_ms > MAX_RETENTION_MS) {
      throw new RunStoreError('INVALID_RETENTION');
    }
    this.now = options.now ?? Date.now;
  }

  async save(input: { report: ReviewedReport; trace: TraceRecord; source: RunRecord['source'] }): Promise<RunRecord> {
    const runId = checkId(input.trace.trace_id);
    const created = this.now();
    const record: RunRecord = redact({ schema_version: '1.0.0', run_id: runId, profile: this.profile, created_at_ms: created,
      expires_at_ms: created + this.retention_ms, source: input.source, report: input.report, trace: input.trace });
    const dir = join(this.root, runId);
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `record.json.${process.pid}.tmp`);
    await writeFile(temp, `${JSON.stringify(record)}\n`, { flag: 'wx' });
    await rename(temp, join(dir, 'record.json'));
    return record;
  }

  async get(id: string): Promise<RunRecord | null> {
    const runId = checkId(id);
    let text: string;
    try { text = await readFile(join(this.root, runId, 'record.json'), 'utf8'); } catch { return null; }
    const record = parseRecord(text, runId);
    if (!record) throw new RunStoreError('INVALID_RECORD');
    return record;
  }

  async list(): Promise<RunSummary[]> {
    let entries: string[];
    try { entries = (await readdir(this.root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
    catch { return []; }
    const now = this.now();
    const out: RunSummary[] = [];
    for (const runId of entries.filter(name => RUN_ID.test(name)).sort()) {
      let record: RunRecord | null = null;
      try { record = parseRecord(await readFile(join(this.root, runId, 'record.json'), 'utf8'), runId); } catch { record = null; }
      out.push(record ? { run_id: runId, profile: record.profile, created_at_ms: record.created_at_ms,
        expires_at_ms: record.expires_at_ms, expired: record.expires_at_ms <= now, corrupt: false, report_status: record.report.status }
        : { run_id: runId, profile: null, created_at_ms: null, expires_at_ms: null, expired: false, corrupt: true, report_status: null });
    }
    return out;
  }

  async delete(id: string): Promise<boolean> {
    const runId = checkId(id);
    const dir = join(this.root, runId);
    try { await readdir(dir); } catch { return false; }
    await rm(dir, { recursive: true, force: true });
    return true;
  }

  async sweep(): Promise<string[]> {
    const deleted: string[] = [];
    for (const run of await this.list()) {
      if ((run.expired || run.corrupt) && await this.delete(run.run_id)) deleted.push(run.run_id);
    }
    return deleted;
  }
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !RUN_ID.test(id)) throw new RunStoreError('INVALID_RUN_ID');
  return id;
}

function inside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function assertSafeRoot(root: string, project: string): void {
  if (inside(project, root)) throw new RunStoreError('UNSAFE_STORE_ROOT');
  for (const name of PROTECTED) {
    const protectedDir = join(project, name);
    if (inside(root, protectedDir) || inside(protectedDir, root)) throw new RunStoreError('UNSAFE_STORE_ROOT');
  }
}

function parseRecord(text: string, runId: string): RunRecord | null {
  try {
    const value = JSON.parse(text) as RunRecord;
    const valid = value?.schema_version === '1.0.0' && value.run_id === runId && (value.profile === 'local' || value.profile === 'demo')
      && Number.isSafeInteger(value.created_at_ms) && Number.isSafeInteger(value.expires_at_ms)
      && value.source?.kind === 'fixture' && typeof value.report?.report_id === 'string' && value.trace?.trace_id === runId;
    return valid ? value : null;
  } catch { return null; }
}
