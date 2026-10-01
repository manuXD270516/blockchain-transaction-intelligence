import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { BlockchainMcpService, PUBLIC_ERROR_CODES } from './service.js';

const chainId = z.literal('11155111');
const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const quantity = z.string().regex(/^(?:0|[1-9][0-9]{0,77})$/);
const block = z.union([
  z.strictObject({ hash }), z.strictObject({ number: quantity }),
  z.strictObject({ tag: z.enum(['latest', 'safe', 'finalized']) }),
]);
const tx = z.strictObject({ chain_id: chainId, tx_hash: hash });
const addressAt = z.strictObject({ chain_id: chainId, address, block });
const schemas = {
  get_transaction: tx,
  get_receipt: tx,
  get_block: z.strictObject({ chain_id: chainId, block }),
  get_wallet_balance: addressAt,
  get_token_transfers: z.strictObject({ chain_id: chainId, tx_hash: hash,
    limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).optional() }),
  get_contract: addressAt,
  get_contract_events: z.strictObject({ chain_id: chainId, address, from_block: quantity, to_block: quantity,
    topics: z.array(z.union([hash, z.null()])).max(4).optional(), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).optional() }),
  trace_transaction: tx,
  search_protocol_docs: z.strictObject({ query: z.string().min(1).max(2000), chain_id: chainId.optional(),
    protocol: z.string().min(1).max(100).optional(), version: z.string().min(1).max(100).optional(), top_k: z.number().int().min(1).max(10).optional() }),
} as const;
const successOutput = z.strictObject({ schema_version: z.literal('1.0.0'), request_id: z.string(),
  status: z.enum(['ok', 'partial', 'not_found', 'unavailable']), data: z.unknown(), evidence_ids: z.array(z.string()),
  snapshot: z.union([z.strictObject({ chain_id: z.string(), block_hash: hash, block_number: quantity,
    finality: z.enum(['unknown', 'safe', 'finalized']), observed_at: z.string() }), z.null()]),
  provenance: z.strictObject({ adapter: z.string(), version: z.string(), fetched_at: z.string(), raw_content_hash: z.union([z.string(), z.null()]) }),
  coverage: z.looseObject({ scope: z.string(), complete: z.boolean(), missing: z.array(z.string()), truncated: z.boolean() }),
  warnings: z.array(z.string()), page: z.union([z.strictObject({ next_cursor: z.union([z.string(), z.null()]) }), z.null()]) });
const errorOutput = z.strictObject({ schema_version: z.literal('1.0.0'), request_id: z.string(),
  error: z.strictObject({ code: z.enum(PUBLIC_ERROR_CODES), message: z.string(), retryable: z.boolean() }), evidence_ids: z.array(z.string()) });
const output = z.union([successOutput, errorOutput]);
const descriptions: Record<keyof typeof schemas, string> = {
  get_transaction: 'Get and normalize one Sepolia transaction.',
  get_receipt: 'Get a Sepolia receipt and its raw logs.',
  get_block: 'Get one verified Sepolia block snapshot.',
  get_wallet_balance: 'Get native wei balance at a verified snapshot.',
  get_token_transfers: 'Extract standard event-reported token transfers for one transaction.',
  get_contract: 'Get bytecode at a verified snapshot; ABI and proxy identity may be unavailable.',
  get_contract_events: 'Get address logs in an inclusive range of at most 100 blocks.',
  trace_transaction: 'Get tracer-reported call frames when the backend supports tracing; the bundled Sepolia adapter does not, so it returns unavailable.',
  search_protocol_docs: 'Search the approved, versioned local protocol corpus with verifiable spans.',
};

export function buildMcpServer(service = new BlockchainMcpService()): McpServer {
  const server = new McpServer({ name: 'blockchain-mcp-server', version: '0.1.0' }, { capabilities: { tools: {} } });
  for (const name of Object.keys(schemas) as (keyof typeof schemas)[]) {
    // The schemas are intentionally distinct; the dispatcher revalidates independently of MCP annotations/schema handling.
    server.registerTool(name, { description: descriptions[name], inputSchema: schemas[name], outputSchema: output,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: name !== 'search_protocol_docs' } },
    async (args: unknown) => service.call(name, args));
  }
  return server;
}
