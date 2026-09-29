// Regression guard for our trusted CLI, not a sandbox for malicious JS.
import { registerHooks } from 'node:module';
const allowed = new Set(['node:crypto', 'node:fs/promises', 'node:path', 'node:url']);
const sourceRoot = new URL('../dist/', import.meta.url).href;
const denied = () => { throw new Error('OFFLINE_POLICY_DENIED'); };
Object.defineProperty(globalThis, 'fetch', { value: denied, writable: false, configurable: false });
Object.defineProperty(globalThis, 'WebSocket', { value: denied, writable: false, configurable: false });
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('node:')) {
      if (!allowed.has(specifier)) denied();
      return nextResolve(specifier, context);
    }
    const result = nextResolve(specifier, context);
    if (!result.url.startsWith(sourceRoot)) denied();
    return result;
  },
});
