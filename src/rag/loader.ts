import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { canonical } from '../normalization/evidence.js';
import { sha256 } from '../fixtures/loader.js';
import { CorpusError } from './errors.js';
import type { CorpusArtifact, CorpusDocument, LoadedCorpus } from './types.js';
import { parseCorpusJson, validateChunks, validateDocument, validateManifest, validateVectors } from './validation.js';

const MAX_MANIFEST = 2 * 1024 * 1024;
const MAX_ARTIFACT = 64 * 1024 * 1024;

function contained(parent: string, child: string): void {
  const path = relative(parent, child);
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new CorpusError('PATH_DENIED');
}

async function readBounded(root: string, artifact: CorpusArtifact | { file: string; bytes?: number }, limit = MAX_ARTIFACT): Promise<Buffer> {
  const path = await realpath(resolve(root, artifact.file));
  contained(root, path);
  if (!(await stat(path)).isFile()) throw new CorpusError('PATH_DENIED');
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    const expected = artifact.bytes;
    if (!info.isFile() || info.size > limit || (expected !== undefined && info.size !== expected)) throw new CorpusError('SIZE_LIMIT');
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== buffer.length) throw new CorpusError('IO_ERROR');
    if ('sha256' in artifact && sha256(buffer) !== artifact.sha256) throw new CorpusError('INTEGRITY_MISMATCH');
    return buffer;
  } finally {
    await file.close();
  }
}

export async function loadCorpus(root: string): Promise<LoadedCorpus> {
  try {
    const directory = await realpath(root);
    const manifestBytes = await readBounded(directory, { file: 'manifest.json' }, MAX_MANIFEST);
    const manifest = validateManifest(parseCorpusJson(manifestBytes));
    for (const artifact of manifest.embedding.artifacts) await readBounded(directory, artifact);

    const documents = new Map<string, CorpusDocument>();
    for (const item of manifest.documents) {
      const document = validateDocument(parseCorpusJson(await readBounded(directory, item)));
      if (document.document_id !== item.document_id || document.content_hash !== item.content_hash || documents.has(document.document_id)) {
        throw new CorpusError('INTEGRITY_MISMATCH');
      }
      documents.set(document.document_id, document);
    }

    const chunks = validateChunks(parseCorpusJson(await readBounded(directory, manifest.chunks)));
    const seen = new Set<string>();
    for (const chunk of chunks) {
      const document = documents.get(chunk.document_id);
      if (!document || chunk.document_hash !== document.content_hash || seen.has(chunk.chunk_id)
        || chunk.start >= chunk.end || document.canonical_text.slice(chunk.start, chunk.end) !== chunk.excerpt
        || sha256(chunk.excerpt) !== chunk.chunk_hash
        || chunk.chunk_id !== sha256(canonical({ document_hash: chunk.document_hash, heading_path: chunk.heading_path,
          start: chunk.start, end: chunk.end, page: chunk.page, chunk_hash: chunk.chunk_hash }))) {
        throw new CorpusError('INTEGRITY_MISMATCH');
      }
      seen.add(chunk.chunk_id);
    }
    if (new Set(chunks.map(chunk => chunk.embedding_index)).size !== chunks.length
      || chunks.some((chunk, index) => chunk.embedding_index !== index)) throw new CorpusError('INVALID_CORPUS');
    const vectors = validateVectors(parseCorpusJson(await readBounded(directory, manifest.vectors)), chunks.length);
    return { root: directory, manifest, manifest_hash: sha256(manifestBytes), documents, chunks, vectors };
  } catch (error) {
    if (error instanceof CorpusError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new CorpusError('CORPUS_NOT_CONFIGURED');
    throw new CorpusError('IO_ERROR');
  }
}
