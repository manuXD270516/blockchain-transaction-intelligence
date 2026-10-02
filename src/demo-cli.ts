import { buildDemo, DemoBuildError, verifyDemoOutput } from './demo/build.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'verify' && args.length === 1 && args[0]) {
    // Local check of a built site before upload; publication is recorded only by the post-deploy verification.
    const manifest = await verifyDemoOutput(args[0]);
    process.stdout.write(`${JSON.stringify({ verified: true, published: false, demo_version: manifest.demo_version,
      evaluation_result_id: manifest.evaluation_result_id, files: Object.keys(manifest.files).length })}\n`);
    return;
  }
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
