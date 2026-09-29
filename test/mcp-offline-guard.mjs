// Regression guard for the trusted MCP process. It blocks outbound network APIs while allowing stdio.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const denied = () => { throw new Error('OFFLINE_POLICY_DENIED'); };
for (const module of [http, https]) {
  module.request = denied;
  module.get = denied;
}
net.connect = denied;
net.createConnection = denied;
tls.connect = denied;
Object.defineProperty(globalThis, 'fetch', { value: denied, writable: false, configurable: false });
Object.defineProperty(globalThis, 'WebSocket', { value: denied, writable: false, configurable: false });
syncBuiltinESMExports();
