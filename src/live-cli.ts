import { EthereumAdapter } from './adapters/ethereum.js';
import { AdapterError } from './adapters/contracts.js';

const [command, hash, ...extra] = process.argv.slice(2);
if (extra.length || !((command === 'investigate' && hash !== undefined) || (command === 'smoke' && hash === undefined))) {
  process.stderr.write('Usage: node dist/live-cli.js smoke | investigate <tx-hash>\n');
  process.exitCode = 2;
} else {
  try {
    const adapter = new EthereumAdapter();
    if (command === 'smoke') {
      const result = await adapter.getBlock({ tag: 'finalized' });
      process.stdout.write(`${JSON.stringify({ schema_version: '1.0.0', mode: 'testnet_live',
        snapshot: result.snapshot, rpc_attempts: result.attempts.length }, null, 2)}\n`);
    } else process.stdout.write(`${JSON.stringify(await adapter.investigate(hash!), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: { code: error instanceof AdapterError ? error.code : 'PROVIDER_ERROR' } })}\n`);
    process.exitCode = 1;
  }
}
