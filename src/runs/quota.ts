import { sha256 } from '../fixtures/loader.js';

export const QUOTA_VERSION = 'identity-quota/1.0.0';
const MAX_IDENTITIES = 10000;

export class QuotaError extends Error {
  constructor(readonly code: 'RATE_LIMITED' | 'INVALID_INPUT', readonly retry_after_ms: number | null = null) {
    super(code); this.name = 'QuotaError';
  }
}

export interface QuotaOptions { window_ms: number; max_runs: number; max_concurrent: number; now?: () => number }
interface Usage { window_start: number; runs: number; active: number }

/**
 * Fixed-window per-identity quota for future remote transports. Identities are kept only as SHA-256.
 * In-memory and process-local: it is a policy component, not a distributed rate limiter.
 */
export class RunQuota {
  readonly version = QUOTA_VERSION;
  readonly #usage = new Map<string, Usage>();
  readonly #now: () => number;
  constructor(private readonly options: QuotaOptions) {
    for (const [value, max] of [[options.window_ms, 86_400_000], [options.max_runs, 10_000], [options.max_concurrent, 100]] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new QuotaError('INVALID_INPUT');
    }
    this.#now = options.now ?? Date.now;
  }

  /** Reserves one run for `identity`; returns a release function or throws RATE_LIMITED. */
  acquire(identity: string): () => void {
    if (typeof identity !== 'string' || identity.length < 1 || identity.length > 200) throw new QuotaError('INVALID_INPUT');
    const key = sha256(`quota:${identity}`);
    const now = this.#now();
    this.#purge(now);
    let usage = this.#usage.get(key);
    if (usage && now - usage.window_start >= this.options.window_ms) usage = { window_start: now, runs: 0, active: usage.active };
    if (!usage) {
      if (this.#usage.size >= MAX_IDENTITIES) throw new QuotaError('RATE_LIMITED', this.options.window_ms);
      usage = { window_start: now, runs: 0, active: 0 };
    }
    if (usage.runs >= this.options.max_runs) {
      this.#usage.set(key, usage);
      throw new QuotaError('RATE_LIMITED', Math.max(0, usage.window_start + this.options.window_ms - now));
    }
    if (usage.active >= this.options.max_concurrent) { this.#usage.set(key, usage); throw new QuotaError('RATE_LIMITED', 0); }
    usage.runs++; usage.active++;
    this.#usage.set(key, usage);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.#usage.get(key);
      if (current && current.active > 0) current.active--;
    };
  }

  /** Hashed keys only; used by tests and diagnostics to prove identities are not stored in clear. */
  keys(): string[] { return [...this.#usage.keys()]; }

  #purge(now: number): void {
    for (const [key, usage] of this.#usage) {
      if (usage.active === 0 && now - usage.window_start >= this.options.window_ms) this.#usage.delete(key);
    }
  }
}
