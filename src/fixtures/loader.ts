import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { FixtureError } from '../domain/errors.js';
import type { LoadedFixture, Role } from '../domain/types.js';
import { FIXTURE_ID, MAX_ARTIFACT_BYTES, MAX_MANIFEST_BYTES, parseJson, validateManifest, validatePayloads } from './validation.js';

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function requireContained(parent: string, child: string): void {
  const path = relative(parent, child);
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new FixtureError('PATH_DENIED');
  }
}

export async function readBounded(directory: string, name: string, limit: number): Promise<Buffer> {
  const path = await realpath(resolve(directory, name));
  requireContained(directory, path);
  // Avoid opening devices/FIFOs. The root is administrator-owned, not a concurrent attacker workspace.
  if (!(await stat(path)).isFile()) throw new FixtureError('PATH_DENIED');
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new FixtureError('PATH_DENIED');
    if (info.size > limit) throw new FixtureError('SIZE_LIMIT');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > limit) throw new FixtureError('SIZE_LIMIT');
    return buffer.subarray(0, length);
  } finally {
    await file.close();
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export async function loadFixture(root: string, fixtureId: string): Promise<LoadedFixture> {
  if (fixtureId.length > 100 || !FIXTURE_ID.test(fixtureId)) throw new FixtureError('INVALID_FIXTURE_ID');
  try {
    const directory = await realpath(root);
    const fixtureDirectory = await realpath(resolve(directory, fixtureId));
    requireContained(directory, fixtureDirectory);
    const manifestBytes = await readBounded(fixtureDirectory, 'manifest.json', MAX_MANIFEST_BYTES);
    const manifest = validateManifest(parseJson(manifestBytes, 'manifest'), fixtureId);
    const payloads: Partial<Record<Role, unknown>> = {};
    for (const artifact of manifest.artifacts) {
      const bytes = await readBounded(fixtureDirectory, artifact.file, MAX_ARTIFACT_BYTES);
      if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
        throw new FixtureError('INTEGRITY_MISMATCH');
      }
      payloads[artifact.role] = parseJson(bytes, 'payload');
    }
    const raw = validatePayloads(manifest, payloads.transaction, payloads.receipt, payloads.block);
    return deepFreeze({ manifest, manifest_sha256: sha256(manifestBytes), raw });
  } catch (error) {
    if (error instanceof FixtureError) throw error;
    // Do not echo arbitrary OS/provider paths or contents into user-visible errors.
    throw new FixtureError('IO_ERROR');
  }
}
