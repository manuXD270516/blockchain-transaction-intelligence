import { posix } from 'node:path';
import { escapeHtml, page } from '../graph/html.js';
import { renderGraphBody } from '../graph/render.js';
import type { GraphView } from '../graph/view.js';
import type { EvaluationResult } from '../evals/runner.js';
import type { ReviewedClaim, ReviewedReport } from '../review/types.js';

export interface DemoEntry { fixture_id: string; title: string; lesson: string }

const LIMITS = [
  'Sólo datos sintéticos incluidos en el repositorio; no consulta la blockchain ni acepta hashes del visitante.',
  'No conecta wallets, no firma, no envía transacciones ni mueve fondos, tampoco en testnet.',
  'No identifica personas ni atribuye intención, fraude o riesgo; las direcciones quedan como desconocidas.',
  'No es una auditoría de seguridad. Los eventos de tokens son reportes del contrato emisor, no prueba de saldos.',
  'Sin proveedor de modelo en la demo: los reportes muestran hechos validados y quedan inconclusos por diseño.',
];
const PRIVACY = [
  'Páginas HTML estáticas sin JavaScript, formularios, cookies, analítica ni recursos externos.',
  'La política de contenido (CSP) bloquea scripts, conexiones, imágenes y envíos de formularios.',
  'No se registra ni se guarda nada del visitante; el sitio no tiene servidor de aplicación.',
];

const nav = (prefix: string) => `<nav><a href="${prefix}index.html">Inicio</a><a href="${prefix}evaluation.html">Evaluación</a></nav>`;
const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

export function renderIndex(entries: readonly DemoEntry[], reports: ReadonlyMap<string, ReviewedReport>, evaluation: EvaluationResult,
  demoVersion: string): string {
  const safety = evaluation.gates.filter(gate => gate.kind === 'safety');
  const quality = evaluation.gates.filter(gate => gate.kind === 'quality');
  const rows = entries.map(entry => `<tr><td><a href="fixtures/${escapeHtml(entry.fixture_id)}.html">${escapeHtml(entry.title)}</a></td><td><code>${escapeHtml(entry.fixture_id)}</code></td><td>${escapeHtml(reports.get(entry.fixture_id)?.status ?? '-')}</td><td>${escapeHtml(entry.lesson)}</td></tr>`).join('\n');
  return page('Blockchain Transaction Intelligence · demo educativa', `${nav('')}
<h1>Blockchain Transaction Intelligence</h1>
<p>Demo educativa de sólo lectura (versión ${escapeHtml(demoVersion)}). Muestra cómo el sistema reconstruye una transacción a partir de evidencia verificada, separa hechos observados de inferencias y enlaza cada relación del grafo con su evidencia.</p>
<h2>Casos</h2>
<table><tr><th>caso</th><th>fixture</th><th>estado del reporte</th><th>qué enseña</th></tr>
${rows}</table>
<h2>Límites</h2>${list(LIMITS)}
<h2>Privacidad</h2>${list(PRIVACY)}
<h2>Evaluación</h2>
<p class="notice">Gates de seguridad aprobadas: ${safety.filter(gate => gate.status === 'passed').length}/${safety.length}; gates de calidad: ${quality.filter(gate => gate.status === 'passed').length} aprobadas, ${quality.filter(gate => gate.status === 'not_applicable').length} no aplicables, ${quality.filter(gate => gate.status === 'failed').length} fallidas. El sitio sólo se genera si ninguna gate aplicable falla. <a href="evaluation.html">Ver dashboard</a>.</p>`);
}

function claims(title: string, items: readonly ReviewedClaim[]): string {
  if (!items.length) return `<h3>${escapeHtml(title)}</h3><p>Ninguno.</p>`;
  return `<h3>${escapeHtml(title)}</h3><table><tr><th>texto</th><th>clase</th><th>estado</th><th>evidencia</th></tr>${items.map(item => `<tr><td>${escapeHtml(item.text)}</td><td>${escapeHtml(item.classification)}</td><td>${escapeHtml(item.review_status)}</td><td>${item.evidence_ids.map(id => `<code>${escapeHtml(id.slice(0, 16))}</code>`).join(' ')}</td></tr>`).join('')}</table>`;
}

export function renderFixturePage(entry: DemoEntry, report: ReviewedReport, view: GraphView): string {
  return page(`${entry.title} · demo`, `${nav('../')}
<h1>${escapeHtml(entry.title)}</h1>
<p>${escapeHtml(entry.lesson)}</p>
<p class="notice">SYNTHETIC_DATA: fixture <code>${escapeHtml(entry.fixture_id)}</code> generado para pruebas; no es una transacción pública. REVIEW_IS_NOT_A_SECURITY_AUDIT.</p>
<h2>Reporte revisado</h2>
<p>Estado: <strong>${escapeHtml(report.status)}</strong> · <code>${escapeHtml(report.report_id.slice(0, 16))}</code></p>
<p>${escapeHtml(report.summary.statement)}</p>
<p>El reporte queda inconcluso porque la demo no tiene proveedor de modelo: sólo se publican hechos del baseline que pasaron la validación determinística.</p>
${claims('Conclusiones revisadas', report.conclusions)}
${claims('Hechos validados', report.validated_facts)}
<h3>Anomalías</h3>${report.anomalies.length ? list(report.anomalies.map(item => `${item.label} (${item.classification})`)) : '<p>Ninguna.</p>'}
<h3>Limitaciones</h3>${list(report.limitations)}
<h3>Advertencias</h3>${list(report.warnings)}
<h3>Cobertura</h3><p>Baseline completo: ${escapeHtml(report.coverage.baseline_complete)} · faltante: ${escapeHtml(report.coverage.missing.join(', ') || 'nada')} · revisión pendiente: ${escapeHtml(report.coverage.review_missing.join(', ') || 'nada')}</p>
${renderGraphBody(view)}`);
}

export function withNavigation(html: string): string {
  return html.replace('<body>\n', `<body>\n${nav('')}\n`);
}

const FORBIDDEN_DOCUMENT: [RegExp, string][] = [
  [/<script/i, 'script element'], [/<form/i, 'form element'], [/<input/i, 'input element'], [/<iframe/i, 'iframe element'],
  [/<object/i, 'object element'], [/<embed/i, 'embed element'], [/<link/i, 'link element'], [/<img/i, 'img element'],
  [/<meta[^>]+http-equiv="refresh"/i, 'meta refresh'], [/\b(?:https?|javascript|data|ftp|ws|wss):/i, 'absolute or executable URL'],
];
const FORBIDDEN_MARKUP: [RegExp, string][] = [
  [/\son[a-z]+\s*=/i, 'event handler attribute'], [/\ssrc\s*=/i, 'src attribute'],
  [/(?:href|action)\s*=\s*["']?\/\//i, 'protocol-relative URL'], [/url\s*\(/i, 'CSS url()'], [/@import/i, 'CSS import'],
];

function markup(html: string): string {
  return [...html.matchAll(/<[^>]*>/g), ...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map(match => match[1] ?? match[0]).join('\n');
}

export function auditSite(files: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const [path, html] of files) {
    if (!path.endsWith('.html')) continue;
    if (!/<meta http-equiv="Content-Security-Policy" content="default-src 'none';/.test(html)) problems.push(`${path}: missing strict CSP`);
    for (const [pattern, label] of FORBIDDEN_DOCUMENT) if (pattern.test(html)) problems.push(`${path}: ${label}`);
    const tags = markup(html);
    for (const [pattern, label] of FORBIDDEN_MARKUP) if (pattern.test(tags)) problems.push(`${path}: ${label}`);
    const ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map(match => match[1]!));
    for (const match of html.matchAll(/\shref="([^"]*)"/g)) {
      const href = match[1]!;
      if (href.startsWith('#')) {
        if (!/^#edge-[0-9a-f]{16}$/.test(href) || !ids.has(href.slice(1))) problems.push(`${path}: broken anchor ${href}`);
      } else if (!/^(?:\.\.\/)?(?:[a-z0-9-]+\/)?[a-z0-9-]+\.html$/.test(href) || !files.has(posix.normalize(posix.join(posix.dirname(path), href)))) {
        problems.push(`${path}: invalid link ${href}`);
      }
    }
    if (/\shref=(?!")/.test(html)) problems.push(`${path}: unquoted href`);
  }
  return problems;
}
