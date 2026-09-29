import { escapeHtml, page } from '../graph/html.js';
import type { Metric } from './metrics.js';
import type { EvaluationResult } from './runner.js';

const format = (metric: Metric | undefined) => !metric ? '-' : metric.status !== 'measured' ? metric.status
  : `${metric.value === null ? '-' : Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(4)}`
    + (metric.denominator === null ? '' : ` (${metric.numerator ?? '·'}/${metric.denominator})`);

export function renderDashboard(result: EvaluationResult): string {
  const gates = result.gates.map(gate => `<tr><td>${escapeHtml(gate.id)}</td><td>${escapeHtml(gate.kind)}</td><td>${escapeHtml(`${gate.op} ${gate.threshold}`)}</td><td>${escapeHtml(gate.value ?? 'null')}</td><td class="${gate.status === 'passed' ? 'executed' : gate.status === 'failed' ? 'reverted' : 'unknown'}">${escapeHtml(gate.status)}</td></tr>`).join('\n');
  const metrics = Object.entries(result.metrics).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, metric]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(format(metric))}</td><td>${escapeHtml(metric.status)}</td></tr>`).join('\n');
  const groups = (title: string, data: Record<string, Record<string, Metric>>) => `<h3>${escapeHtml(title)}</h3><table><tr><th>grupo</th><th>reconstruction_f1</th><th>event_f1</th></tr>${Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([name, values]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(format(values.reconstruction_f1))}</td><td>${escapeHtml(format(values.event_f1))}</td></tr>`).join('')}</table>`;
  return page('Evaluación consolidada', `<h1>Evaluación consolidada</h1>
<p class="notice">Release: <strong class="${result.release_blocked ? 'reverted' : 'executed'}">${result.release_blocked ? 'BLOQUEADO' : 'gates aplicables aprobadas'}</strong> · golden ${escapeHtml(result.golden_version)} · result <code>${escapeHtml(result.result_id.slice(0, 16))}</code> · comparable_key <code>${escapeHtml(result.comparable_key.slice(0, 16))}</code></p>
<p>Cobertura: ${result.coverage.executed}/${result.coverage.planned} casos ejecutados; inválidos: ${escapeHtml(result.coverage.invalid.join(', ') || 'ninguno')}.</p>
<p>Latencia offline sin modelo: p50 ${escapeHtml(result.latency.p50_ms ?? 'N/A')} ms, p95 ${escapeHtml(result.latency.p95_ms ?? 'N/A')} ms en ${result.latency.runs} runs. ${escapeHtml(result.latency.note)}</p>
<p>Tokens: ${escapeHtml(result.tokens.status)} — ${escapeHtml(result.tokens.reason)}</p>
<h2>Gates</h2><table><tr><th>gate</th><th>tipo</th><th>umbral</th><th>valor</th><th>estado</th></tr>${gates}</table>
<h2>Métricas</h2><table><tr><th>métrica</th><th>valor (n/d)</th><th>estado</th></tr>${metrics}</table>
${groups('Por familia', result.by_family)}${groups('Por split', result.by_split)}
<p class="notice">Suite finita y sintética: no demuestra ausencia de errores ni calibra probabilidades de intención o fraude.</p>`);
}
