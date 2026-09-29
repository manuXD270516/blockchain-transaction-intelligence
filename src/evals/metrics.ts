export type MetricStatus = 'measured' | 'N/A' | 'unavailable';
export interface Metric { value: number | null; numerator: number | null; denominator: number | null; status: MetricStatus }
export interface Counts { tp: number; fp: number; fn: number }

export function ratio(numerator: number, denominator: number): Metric {
  return denominator > 0 ? { value: numerator / denominator, numerator, denominator, status: 'measured' }
    : { value: null, numerator, denominator, status: 'N/A' };
}

export function averaged(value: number | null, denominator: number): Metric {
  if (value === null) return unavailable();
  return denominator > 0 ? { value, numerator: null, denominator, status: 'measured' }
    : { value: null, numerator: null, denominator, status: 'N/A' };
}

export function count(value: number): Metric { return { value, numerator: value, denominator: null, status: 'measured' }; }

export function unavailable(): Metric { return { value: null, numerator: null, denominator: null, status: 'unavailable' }; }

export function prf(counts: Counts): { precision: Metric; recall: Metric; f1: Metric } {
  return { precision: ratio(counts.tp, counts.tp + counts.fp), recall: ratio(counts.tp, counts.tp + counts.fn),
    f1: ratio(2 * counts.tp, 2 * counts.tp + counts.fp + counts.fn) };
}

export function compareSets(expected: readonly string[], actual: readonly string[]): Counts {
  const want = new Set(expected); const got = new Set(actual);
  let tp = 0;
  for (const item of got) if (want.has(item)) tp++;
  return { tp, fp: got.size - tp, fn: want.size - tp };
}

export function addCounts(a: Counts, b: Counts): Counts { return { tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }; }

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}
