// Maintainer/CI utility: verifies the deployed GitHub Pages demo against the build manifest.
// It is the only path that emits `published: true`. It performs GET requests only and is not part of `npm test`.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PAGES = /^https:\/\/[a-z0-9-]+\.github\.io\/[A-Za-z0-9._-]+\/$/;
const SECRETS = [/ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/];
const ACTIVE = [/<script/i, /\son[a-z]+\s*=/i, /\b(?:src)\s*=/i, /\b(?:javascript|data):/i, /<form/i, /<iframe/i];
const EXTERNAL = /\b(?:href|src|action)\s*=\s*"(?:https?:)?\/\//i;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * @param {{ base: string, manifest: { files: Record<string, string>, evaluation_result_id: string, demo_version: string },
 *   fetchImpl?: typeof fetch }} options
 */
export async function verifyLive({ base, manifest, fetchImpl = fetch }) {
  if (!PAGES.test(base)) throw new Error('INVALID_PAGES_URL');
  if (!manifest || typeof manifest.files !== 'object' || manifest.files === null || typeof manifest.evaluation_result_id !== 'string'
    || typeof manifest.files['index.html'] !== 'string') throw new Error('INVALID_MANIFEST');
  const problems = [];
  const headers = {};
  for (const [path, expected] of Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^(?:[a-z0-9-]+\/)?[a-z0-9-]+\.html$/.test(path)) { problems.push(`${path}: unexpected path`); continue; }
    const response = await fetchImpl(new URL(path, base), { redirect: 'error', headers: { 'Cache-Control': 'no-cache' } });
    const body = Buffer.from(await response.arrayBuffer());
    const text = body.toString('utf8');
    if (response.status !== 200) { problems.push(`${path}: HTTP ${response.status}`); continue; }
    if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) problems.push(`${path}: content-type`);
    if (sha256(body) !== expected) problems.push(`${path}: hash mismatch`);
    if (!/<meta http-equiv="Content-Security-Policy" content="default-src 'none';/.test(text)) problems.push(`${path}: missing strict CSP`);
    for (const pattern of ACTIVE) if (pattern.test(text)) problems.push(`${path}: active content ${pattern}`);
    if (EXTERNAL.test(text)) problems.push(`${path}: external URL`);
    for (const pattern of SECRETS) if (pattern.test(text)) problems.push(`${path}: secret pattern ${pattern.source}`);
    if (path === 'index.html') {
      for (const name of ['strict-transport-security', 'x-content-type-options', 'content-security-policy', 'referrer-policy', 'x-frame-options']) {
        headers[name] = response.headers.get(name);
      }
    }
  }
  return problems.length ? { published: false, problems }
    : { published: true, url: base, demo_version: manifest.demo_version, evaluation_result_id: manifest.evaluation_result_id,
      files: Object.keys(manifest.files).length, response_headers: headers,
      header_note: 'GitHub Pages does not allow custom headers; CSP is enforced through <meta> in every page.' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, manifestPath, commit] = process.argv.slice(2);
  try {
    if (!base || !manifestPath) throw new Error('USAGE: node scripts/verify-pages.mjs <pages-url> <manifest.json> [commit]');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const result = await verifyLive({ base, manifest });
    process.stdout.write(`${JSON.stringify({ ...result, ...(commit ? { commit } : {}) }, null, 2)}\n`);
    if (!result.published) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'VERIFY_FAILED' })}\n`);
    process.exitCode = 1;
  }
}
