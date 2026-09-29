# Local development tooling only; no application runtime dependency.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.tools/graphify/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Install .tools/graphify first; see docs/graphify.md.' }
$env:PYTHONUTF8 = '1'
$env:PYTHONHASHSEED = '0'
$env:GRAPHIFY_QUERY_LOG_DISABLE = '1'
Push-Location $projectRoot
try {
    & $pythonPath -m graphify @args
    $graphifyExit = $LASTEXITCODE
} finally { Pop-Location }
exit $graphifyExit
