export type CorpusErrorCode = 'CORPUS_NOT_CONFIGURED' | 'INVALID_CORPUS' | 'PATH_DENIED'
  | 'SIZE_LIMIT' | 'INTEGRITY_MISMATCH' | 'MODEL_ERROR' | 'IO_ERROR';

export class CorpusError extends Error {
  constructor(public readonly code: CorpusErrorCode) {
    super(code);
    this.name = 'CorpusError';
  }
}
