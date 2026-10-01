# Local Linux evidence for the CI workflow steps (.github/workflows/ci.yml). This is NOT remote CI.
# Stage 1 clones the committed HEAD and installs dependencies (needs network for the image and npm registry).
# Stage 2 runs tests, fixture regeneration and every eval inside a container with `--network none`.
# Only the container names and the volume below are created and removed; other containers are untouched.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path -replace '\\', '/'
$image = 'node:' + (Get-Content (Join-Path $PSScriptRoot '../.nvmrc')).Trim() + '-bookworm'
$volume = 'bti-local-ci'
docker volume rm $volume 2>$null | Out-Null
docker volume create $volume | Out-Null
try {
  $install = @'
set -eu
cd /home/node
git config --global --add safe.directory '*'
git clone -q /src repo
cd repo
echo "commit=$(git rev-parse HEAD)"
node --version; npm --version; uname -srm
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
'@
  docker run --rm --name bti-local-ci-install -u node -v "${volume}:/home/node" -v "${repo}:/src:ro" $image bash -c ($install -replace "`r", '')
  if ($LASTEXITCODE -ne 0) { throw 'install stage failed' }

  $verify = @'
set -eu
cd /home/node/repo
echo "interfaces: $(ls /sys/class/net | tr '\n' ' ')"
node -e "fetch('https://registry.npmjs.org').then(()=>{console.log('NETWORK REACHABLE');process.exit(1)},e=>console.log('network unreachable:',e.cause?.code||e.message))"
node --test test/*.test.mjs 2>&1 | tail -n 9
node scripts/generate-fixtures.mjs
git diff --exit-code -- fixtures/ && echo "fixtures: no diff"
node dist/rag-admin-cli.js verify corpus/snapshots/m5-v1
node dist/rag-eval-cli.js evals/protocol-rag-qrels.json | head -c 160; echo
node dist/agent-eval-cli.js evals/agent-tool-policy.json | head -c 120; echo
node dist/review-eval-cli.js evals/review-cases.json | head -c 260; echo
node dist/eval-cli.js run > /tmp/eval.json
node -e "const r=require('/tmp/eval.json');const c={};for(const g of r.gates)c[g.status]=(c[g.status]||0)+1;console.log('eval release_blocked=',r.release_blocked,JSON.stringify(c))"
node dist/demo-cli.js build
'@
  docker run --rm --name bti-local-ci-test --network none -u node -v "${volume}:/home/node" $image bash -c ($verify -replace "`r", '')
  if ($LASTEXITCODE -ne 0) { throw 'offline verification stage failed' }
} finally {
  docker volume rm $volume 2>$null | Out-Null
}
