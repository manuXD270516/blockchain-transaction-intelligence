import { buildDemo, DemoBuildError } from './demo/build.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'build' || !(args.length === 0 || (args.length === 2 && args[0] === '--out' && args[1]))) throw new Error('INVALID_INPUT');
  const manifest = await buildDemo(args.length ? { out: args[1]! } : {});
  process.stdout.write(`${JSON.stringify({ built: true, published: false, demo_version: manifest.demo_version,
    evaluation_result_id: manifest.evaluation_result_id, files: Object.keys(manifest.files).length })}\n`);
}

main().catch(error => {
  const code = error instanceof DemoBuildError ? error.code : error instanceof Error && error.message === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'DEMO_BUILD_FAILED';
  const problems = error instanceof DemoBuildError ? error.problems : [];
  process.stderr.write(`${JSON.stringify({ error: { code, problems } })}\n`);
  process.exitCode = 1;
});
