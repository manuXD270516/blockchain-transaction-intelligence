export type ErrorCode =
  | 'INVALID_FIXTURE_ID'
  | 'INVALID_MANIFEST'
  | 'INVALID_PAYLOAD'
  | 'PATH_DENIED'
  | 'SIZE_LIMIT'
  | 'INTEGRITY_MISMATCH'
  | 'INCONSISTENT_SNAPSHOT'
  | 'IO_ERROR';

const messages: Record<ErrorCode, string> = {
  INVALID_FIXTURE_ID: 'Use a lowercase fixture slug, not a path.',
  INVALID_MANIFEST: 'The fixture manifest does not match schema 1.0.0.',
  INVALID_PAYLOAD: 'A raw artifact does not match the supported fixture shape.',
  PATH_DENIED: 'Fixture files must stay inside their assigned directory.',
  SIZE_LIMIT: 'A fixture file exceeds the allowed size.',
  INTEGRITY_MISMATCH: 'Artifact bytes do not match the manifest.',
  INCONSISTENT_SNAPSHOT: 'Fixture records refer to incompatible snapshots.',
  IO_ERROR: 'Unable to read the requested fixture.',
};

export class FixtureError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(messages[code]);
    this.name = 'FixtureError';
  }
}
