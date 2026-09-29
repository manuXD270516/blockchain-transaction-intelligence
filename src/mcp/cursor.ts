import { createHmac, timingSafeEqual } from 'node:crypto';

export class CursorError extends Error { constructor() { super('INVALID_CURSOR'); } }
interface Payload { v: 1; tool: string; query_hash: string; offset: number; expires_at: number }

export class CursorCodec {
  constructor(private readonly secret: Uint8Array, private readonly now = () => Date.now()) {
    if (secret.byteLength < 32) throw new Error('CURSOR_SECRET_TOO_SHORT');
  }
  encode(tool: string, queryHash: string, offset: number, ttlMs = 300000): string {
    const body = Buffer.from(JSON.stringify({ v: 1, tool, query_hash: queryHash, offset,
      expires_at: this.now() + ttlMs } satisfies Payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }
  decode(cursor: string, tool: string, queryHash: string): number {
    try {
      const [body, supplied, extra] = cursor.split('.');
      if (!body || !supplied || extra) throw new CursorError();
      const expected = this.sign(body);
      const a = Buffer.from(supplied); const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new CursorError();
      const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
      if (value.v !== 1 || value.tool !== tool || value.query_hash !== queryHash
        || !Number.isSafeInteger(value.offset) || value.offset < 0 || value.expires_at < this.now()) throw new CursorError();
      return value.offset;
    } catch (error) { if (error instanceof CursorError) throw error; throw new CursorError(); }
  }
  private sign(value: string): string { return createHmac('sha256', this.secret).update(value).digest('base64url'); }
}
