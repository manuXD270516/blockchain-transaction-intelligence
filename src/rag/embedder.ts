import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ort from 'onnxruntime-web';
import { CorpusError } from './errors.js';
import { EMBEDDING_DIMENSION } from './types.js';

export interface Embedder {
  embed(text: string): Promise<readonly number[]>;
}

export class MiniLmEmbedder implements Embedder {
  private runtime?: Promise<{ session: ort.InferenceSession; vocabulary: Map<string, number> }>;
  constructor(private readonly corpusRoot: string) {}

  async embed(text: string): Promise<readonly number[]> {
    try {
      const { session, vocabulary } = await (this.runtime ??= this.load());
      const ids = wordPiece(text, vocabulary).slice(0, 254);
      ids.unshift(required(vocabulary, '[CLS]'));
      ids.push(required(vocabulary, '[SEP]'));
      const shape: [number, number] = [1, ids.length];
      const inputIds = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), shape);
      const mask = new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), shape);
      const types = new ort.Tensor('int64', BigInt64Array.from(ids, () => 0n), shape);
      const feeds: Record<string, ort.Tensor> = { input_ids: inputIds, attention_mask: mask };
      if (session.inputNames.includes('token_type_ids')) feeds.token_type_ids = types;
      const output = await session.run(feeds);
      const tensor = output.last_hidden_state ?? output[session.outputNames[0]!];
      if (!tensor || tensor.dims.length !== 3 || tensor.dims[2] !== EMBEDDING_DIMENSION) throw new CorpusError('MODEL_ERROR');
      const values = tensor.data as Float32Array;
      const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
      for (let token = 0; token < ids.length; token++) {
        for (let dimension = 0; dimension < EMBEDDING_DIMENSION; dimension++) {
          vector[dimension] = vector[dimension]! + values[token * EMBEDDING_DIMENSION + dimension]!;
        }
      }
      let norm = 0;
      for (let index = 0; index < vector.length; index++) {
        vector[index] = vector[index]! / ids.length;
        norm += vector[index]! ** 2;
      }
      norm = Math.sqrt(norm);
      if (!Number.isFinite(norm) || norm === 0) throw new CorpusError('MODEL_ERROR');
      return vector.map(value => value / norm);
    } catch (error) {
      if (error instanceof CorpusError) throw error;
      throw new CorpusError('MODEL_ERROR');
    }
  }

  private async load(): Promise<{ session: ort.InferenceSession; vocabulary: Map<string, number> }> {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const [model, vocab] = await Promise.all([
      readFile(resolve(this.corpusRoot, 'model/onnx/model_quantized.onnx')),
      readFile(resolve(this.corpusRoot, 'model/vocab.txt'), 'utf8'),
    ]);
    const vocabulary = new Map(vocab.split(/\r?\n/).map((token, index) => [token, index]));
    const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
    return { session, vocabulary };
  }
}

function required(vocabulary: ReadonlyMap<string, number>, token: string): number {
  const id = vocabulary.get(token);
  if (id === undefined) throw new CorpusError('MODEL_ERROR');
  return id;
}

function wordPiece(text: string, vocabulary: ReadonlyMap<string, number>): number[] {
  const unknown = required(vocabulary, '[UNK]');
  const basic = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  const ids: number[] = [];
  for (const token of basic) {
    const direct = vocabulary.get(token);
    if (direct !== undefined) { ids.push(direct); continue; }
    if (token.length > 100) { ids.push(unknown); continue; }
    const pieces: number[] = [];
    let start = 0;
    while (start < token.length) {
      let end = token.length;
      let found: number | undefined;
      while (start < end) {
        const piece = `${start === 0 ? '' : '##'}${token.slice(start, end)}`;
        found = vocabulary.get(piece);
        if (found !== undefined) break;
        end--;
      }
      if (found === undefined) { pieces.length = 0; break; }
      pieces.push(found);
      start = end;
    }
    ids.push(...(pieces.length ? pieces : [unknown]));
  }
  return ids;
}
