import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildMcpServer } from './mcp/server.js';

serveStdio(() => buildMcpServer(), { legacy: 'serve', onerror: error => process.stderr.write(`blockchain-mcp-server: ${error.name}\n`) });
