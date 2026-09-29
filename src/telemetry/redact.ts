export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'password', 'passwd', 'secret',
  'token', 'access_token', 'refresh_token', 'id_token', 'api_key', 'apikey', 'api-key', 'x-api-key', 'private_key',
  'privatekey', 'client_secret']);
const NAME = '(?:authorization|password|passwd|secret|client_secret|token|access_token|refresh_token|id_token|api[_-]?key|x-api-key|private[_-]?key)';
const PATTERNS: [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  [/\b([a-z][a-z0-9+.-]*:\/\/)(?!\[REDACTED\]@)[^\s/@"'<>]+@/gi, `$1${REDACTED}@`],
  [new RegExp(`([?&;](?:${NAME}|key|sig|signature|auth)=)(?!\\[REDACTED\\])[^&#\\s"'<>]+`, 'gi'), `$1${REDACTED}`],
  [new RegExp(`(["']?\\b${NAME}["']?\\s*[:=]\\s*["']?)(?!\\[REDACTED\\])(?!Bearer\\b|Basic\\b)[^\\s"',;&}]+`, 'gi'), `$1${REDACTED}`],
  [/(https?:\/\/[^\s/"'<>]+\/v[0-9]+\/)(?!0x)(?!\[REDACTED\])[A-Za-z0-9_-]{16,}/gi, `$1${REDACTED}`],
];

export function redactString(value: string): string {
  let result = value;
  for (const [pattern, replacement] of PATTERNS) result = result.replace(pattern, replacement);
  return result;
}

export function redact<T>(value: T): T {
  return walk(value, 0) as T;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > 64) return REDACTED;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => walk(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) && item !== null ? REDACTED : walk(item, depth + 1);
    }
    return out;
  }
  return value;
}
