import { escapeHtml, page } from './html.js';
import type { GraphView } from './view.js';

const WIDTH = 960;
const HEIGHT = 560;
const COLORS = { executed: '#2e7d32', reverted: '#c62828', unknown: '#757575' } as const;

export function renderGraphBody(view: GraphView): string {
  const radius = Math.min(WIDTH, HEIGHT) / 2 - 70;
  const cx = WIDTH / 2; const cy = HEIGHT / 2;
  const ordered = [...view.nodes].sort((a, b) => (a.kind === 'transaction' ? -1 : 0) - (b.kind === 'transaction' ? -1 : 0) || a.id.localeCompare(b.id));
  const position = new Map(ordered.map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(1, ordered.length) - Math.PI / 2;
    return [node.id, { x: Math.round(cx + radius * Math.cos(angle)), y: Math.round(cy + radius * Math.sin(angle)) }];
  }));
  const lines = view.edges.map(edge => {
    const a = position.get(edge.from); const b = position.get(edge.to);
    if (!a || !b) return '';
    const dashed = edge.kind === 'transaction_declared' ? '' : edge.kind === 'internal_call' ? ' stroke-dasharray="2 3"' : ' stroke-dasharray="6 4"';
    return `<a href="#${edge.anchor}"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${COLORS[edge.status]}" stroke-width="2"${dashed}><title>${escapeHtml(`${edge.kind} ${edge.status}: ${edge.label}`)}</title></line></a>`;
  }).join('\n');
  const circles = ordered.map(node => {
    const p = position.get(node.id)!;
    const text = node.label.length > 26 ? `${node.label.slice(0, 12)}…${node.label.slice(-8)}` : node.label;
    return `<g><circle cx="${p.x}" cy="${p.y}" r="10" fill="${node.kind === 'transaction' ? '#1565c0' : '#ffffff'}" stroke="#1b1b1b"><title>${escapeHtml(`${node.label} [${node.roles.join(', ')}]`)}</title></circle><text x="${p.x + 14}" y="${p.y + 4}" font-size="11">${escapeHtml(text)}</text></g>`;
  }).join('\n');
  const rows = view.edges.map((edge, index) => `<tr><td>${index}</td><td>${escapeHtml(edge.kind)}</td><td class="${edge.status}">${escapeHtml(edge.status)}</td><td><code>${escapeHtml(edge.from)}</code></td><td><code>${escapeHtml(edge.to)}</code></td><td>${escapeHtml(edge.label)}</td><td>${escapeHtml(edge.order.log_index ?? '-')}${edge.order.batch_index === null ? '' : `/${edge.order.batch_index}`}</td><td><a href="#${edge.anchor}">evidencia</a></td></tr>`).join('\n');
  const panels = view.edges.map(edge => `<section class="panel" id="${edge.anchor}"><h3>${escapeHtml(edge.kind)} · <span class="${edge.status}">${escapeHtml(edge.status)}</span></h3>
<p>${escapeHtml(edge.label)}</p>
<table><tr><th>evidence_id</th><th>kind</th><th>transformation</th></tr>
${edge.evidence.map(item => `<tr><td><code>${escapeHtml(item.evidence_id)}</code></td><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.transformation ?? '-')}</td></tr>`).join('\n')}</table>
<p>Claims que citan esta evidencia: ${edge.claims.length ? edge.claims.map(claim => `<code>${escapeHtml(claim.claim_id.slice(0, 16))}</code> ${escapeHtml(claim.classification)} / ${escapeHtml(claim.review_status)}`).join('; ') : 'ninguno'}</p></section>`).join('\n');
  return `<h2>Grafo de relaciones observadas</h2>
<p>Estado de ejecución: <strong class="${view.execution_status === 'success' ? 'executed' : view.execution_status === 'reverted' ? 'reverted' : 'unknown'}">${escapeHtml(view.execution_status)}</strong> · reporte: ${view.report ? `${escapeHtml(view.report.status)} (<code>${escapeHtml(view.report.report_id.slice(0, 16))}</code>)` : 'no disponible'} · aristas ${view.truncation.shown}/${view.truncation.total}</p>
${view.notices.map(notice => `<p class="notice">${escapeHtml(notice)}</p>`).join('\n')}
<p>Leyenda: <span class="executed">executed</span>, <span class="reverted">reverted</span>, <span class="unknown">unknown</span>; línea continua = valor declarado por la transacción; discontinua = log o evento reportado${view.call_trace_available ? '; punteada = llamada interna reportada por la traza' : ''}.</p>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="grafo">
${lines}
${circles}
</svg>
<h3>Aristas</h3>
<table><tr><th>#</th><th>tipo</th><th>estado</th><th>desde</th><th>hacia</th><th>detalle</th><th>log/batch</th><th></th></tr>
${rows}</table>
<h3>Evidencia por arista</h3>
${panels}`;
}

export function renderGraphHtml(view: GraphView): string {
  return page('Grafo con evidencia', `<h1>Grafo con evidencia</h1>
<p class="notice">REVIEW_IS_NOT_A_SECURITY_AUDIT: vista educativa de datos observados; no identifica personas ni atribuye intención.</p>
${renderGraphBody(view)}`);
}
