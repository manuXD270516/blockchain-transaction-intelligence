import { canonical } from '../normalization/evidence.js';
import { sha256 } from '../fixtures/loader.js';
import type { CorpusChunk } from './types.js';

const TARGET_TOKENS = 600;
const OVERLAP_TOKENS = 80;

export function canonicalMarkdown(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n').normalize('NFC');
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function chunkDocument(documentId: string, documentHash: string, text: string, startIndex: number,
  pages: readonly { page: number; start: number; end: number }[] = []): CorpusChunk[] {
  const headings = headingPositions(text);
  const chunks: CorpusChunk[] = [];
  const ranges = pages.length ? pages : [{ page: null, start: 0, end: text.length }];
  for (const range of ranges) {
    const tokens = [...text.slice(range.start, range.end).matchAll(/\S+/g)]
      .map(match => ({ start: range.start + match.index, end: range.start + match.index + match[0].length }));
    for (let tokenStart = 0; tokenStart < tokens.length;) {
      const tokenEnd = Math.min(tokens.length, tokenStart + TARGET_TOKENS);
      const start = tokens[tokenStart]!.start;
      const end = tokenEnd === tokens.length ? range.end : tokens[tokenEnd - 1]!.end;
      const excerpt = text.slice(start, end);
      const chunkHash = sha256(excerpt);
      const headingPath = headings.filter(item => item.offset <= start).at(-1)?.path ?? ['Document'];
      const identity = { document_hash: documentHash, heading_path: headingPath, start, end, page: range.page, chunk_hash: chunkHash };
      chunks.push({ schema_version: '1.0.0', chunk_id: sha256(canonical(identity)), document_id: documentId,
        document_hash: documentHash, heading_path: headingPath, start, end, page: range.page, excerpt, chunk_hash: chunkHash,
        embedding_index: startIndex + chunks.length });
      if (tokenEnd === tokens.length) break;
      tokenStart = tokenEnd - OVERLAP_TOKENS;
    }
  }
  return chunks;
}

function headingPositions(text: string): { offset: number; path: string[] }[] {
  const result: { offset: number; path: string[] }[] = [];
  const path: string[] = [];
  for (const match of text.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)) {
    const level = match[1]!.length;
    path.splice(level - 1);
    path[level - 1] = match[2]!;
    result.push({ offset: match.index, path: path.filter(Boolean) });
  }
  return result;
}
