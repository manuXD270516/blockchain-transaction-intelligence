import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readInvestigation } from '../dist/investigation-input.js';
import { extractTokenEvents } from '../dist/events/extract.js';
import { BoundedAnalysisOrchestrator } from '../dist/agents/orchestrator.js';
import { buildGraphView } from '../dist/graph/view.js';
import { renderGraphHtml } from '../dist/graph/render.js';

async function view(fixture, limit) {
  const investigation = await readInvestigation('fixture', fixture);
  const report = await new BoundedAnalysisOrchestrator({ now: () => 0 }).runReviewed({ investigation, question: 'Summarize.' });
  return buildGraphView(extractTokenEvents(investigation), report, limit);
}

function assertInert(html) {
  assert.ok(!/<script/i.test(html), 'no script elements');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no event handler attributes');
  assert.ok(!/\ssrc\s*=/i.test(html), 'no src attributes');
  assert.ok(!/\b(?:https?|javascript|data):/i.test(html), 'no external or executable URLs');
  for (const match of html.matchAll(/href="([^"]*)"/g)) assert.match(match[1], /^#edge-[0-9a-f]{16}$/);
}

test('graph without traces exposes observable edges only, each with resolvable evidence', async () => {
  const graph = await view('synthetic-token-events');
  assert.equal(graph.call_trace_available, false);
  assert.deepEqual([...new Set(graph.edges.map(edge => edge.kind))].sort(),
    ['emits', 'token_transfer_reported', 'transaction_declared']);
  assert.ok(graph.edges.every(edge => edge.status === 'executed' && edge.evidence.length > 0
    && edge.evidence.every(item => item.kind !== 'unresolved')));
  assert.equal(graph.edges.filter(edge => edge.kind === 'token_transfer_reported').length, 5);
  assert.ok(graph.edges.filter(edge => edge.kind === 'token_transfer_reported').every(edge => edge.label.includes('event_reported')));
  assert.ok(graph.notices.some(notice => notice.startsWith('NO_CALL_TRACE')));
  assert.equal(graph.edges[0].kind, 'transaction_declared');
  assert.ok(graph.edges.some(edge => edge.claims.length > 0));
  const again = await view('synthetic-token-events');
  assert.deepEqual(graph, again);
});

test('reverted and pending executions stay visible as reverted and unknown', async () => {
  const reverted = await view('synthetic-reverted');
  assert.ok(reverted.edges.every(edge => edge.status === 'reverted'));
  assert.ok(reverted.notices.some(notice => notice.startsWith('REVERTED')));
  const pending = await view('synthetic-pending');
  assert.ok(pending.edges.length > 0 && pending.edges.every(edge => edge.status === 'unknown'));
  assert.ok(pending.notices.some(notice => notice.startsWith('EXECUTION_UNKNOWN')));
  const html = renderGraphHtml(reverted);
  assert.ok(html.includes('class="reverted"'));
  assertInert(html);
});

test('untrusted labels render as inert text with every edge linked to evidence', async () => {
  const graph = await view('synthetic-native-success');
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(1)>" onmouseover="x" javascript:alert(1)';
  const tampered = { ...graph, nodes: graph.nodes.map(node => ({ ...node, label: hostile })),
    edges: graph.edges.map(edge => ({ ...edge, label: hostile })) };
  const html = renderGraphHtml(tampered);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes(hostile));
  assert.ok(!/(?:https?:)/i.test(html));
  assert.ok(!/<script/i.test(html) && !/<img/i.test(html));
  for (const edge of graph.edges) {
    assert.ok(html.includes(`href="#${edge.anchor}"`));
    assert.ok(html.includes(`id="${edge.anchor}"`));
  }
});

test('visual truncation is declared with totals and omission notice', async () => {
  const graph = await view('synthetic-token-events', 3);
  assert.deepEqual(graph.truncation, { limit: 3, total: 11, shown: 3, omitted: 8 });
  assert.ok(graph.notices.some(notice => notice.startsWith('TRUNCATED: showing 3 of 11')));
  const html = renderGraphHtml(graph);
  assert.ok(html.includes('aristas 3/11'));
  assertInert(html);
});

test('graph CLI remains offline and emits a self-contained page', () => {
  const cli = fileURLToPath(new URL('../dist/graph-cli.js', import.meta.url));
  const guard = new URL('./mcp-offline-guard.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-token-events'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.startsWith('<!doctype html>'));
  assertInert(run.stdout);
  const json = spawnSync(process.execPath, ['--import', guard, cli, 'fixture', 'synthetic-token-events', '--json'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(JSON.parse(json.stdout).schema_version, '1.0.0');
});
