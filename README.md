# blockchain-transaction-intelligence

Plataforma analítica y educativa para investigar transacciones EVM mediante datos públicos, MCP, agentes y RAG con evidencia verificable.

**Estado: M0–M11 y las trazas de llamadas offline están implementados y verificados localmente y en GitHub Actions (run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154), 184/184 tests bajo red aislada).** Hay replay offline, adapter Ethereum Sepolia de sólo lectura, normalización canónica, extracción estricta de eventos estándar, trazas de llamadas sintéticas, servidor MCP stdio, retrieval documental versionado, orquestación analítica acotada, revisión de evidencia con reporte, grafo HTML con evidencia, runner de evaluación con gates, telemetría local con retención y cuotas por identidad, identificación de contratos/proxies por bloque, versiones de corpus con resolución de citas y un sitio de demo estático con workflow de publicación en GitHub Pages preparado pero **todavía no publicado**. El tracing live tiene la configuración lista; su ejecución queda pendiente de un proveedor con `debug_traceTransaction`. No firma, custodia, invierte, despliega contratos ni mueve fondos, tampoco en testnet.

[Listado completo de funcionalidades y status](docs/feature-status.md) · [Validación M0–M11](docs/verification.md)

## Ejecutar

Requisitos: Node 22.15+ (probado con 22.23.1) y npm. Desde este directorio:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run demo
```

La instalación puede necesitar red. `npm run check` usa fixtures y transporte simulado; `demo` es offline. No requiere credenciales ni wallet. Después del build:

```powershell
node dist/cli.js replay synthetic-native-success
node dist/cli.js replay synthetic-reverted
node dist/cli.js replay synthetic-pending
```

Cada resumen incluye estado, cobertura, hashes de integridad y advertencia synthetic; todavía no es un reporte revisado por agentes. `coverage.complete` de M0 cubre sólo transaction/receipt/block, no toda la ejecución EVM.

## Verificación reproducible (offline)

Ninguno de estos comandos necesita credenciales, claves de API, proveedor de modelos ni RPC. Sólo `npm ci` usa red.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run check          # typecheck estricto, build y 184 tests
npm run rag:verify; npm run rag:eval; npm run agent:eval; npm run review:eval
npm run eval           # runner consolidado con gates de release
npm run demo:site      # genera dist-demo/; no publica nada
openspec validate --all --strict --no-interactive
./scripts/local-linux-ci.ps1   # opcional, requiere Docker
```

`scripts/local-linux-ci.ps1` ejecuta los pasos de la CI en un contenedor `node:22.23.1-bookworm`:

1. Clona el HEAD confirmado e instala dependencias, la única fase con red.
2. Ejecuta tests, regeneración de fixtures y todos los evals con `--network none`.

Resultados y fecha en [docs/verification.md](docs/verification.md).

## Sepolia live (explícito)

```powershell
npm run live:smoke
npm run live:investigate -- <hash-real-de-transaccion-Sepolia>
```

Reemplazar el placeholder por un hash real. El smoke lee chain ID y bloque finalized del proveedor fijo PublicNode. La investigación obtiene transaction/receipt/block y valida canonicalidad. No usar los hashes sintéticos de fixtures como transacciones públicas. Sin endpoint configurable por usuario ni operaciones mutantes.

API interna: `EthereumAdapter.investigate`, `getBlock`, `getBalance`, `getCode`, `getLogs`; `FixtureAdapter.investigate` comparte contrato con modo synthetic. El backend M1 consulta logs por dirección y un solo bloque; M4 compone rangos MCP acotados. Historial completo, tracing y ABI no están implementados.

## Normalización M2

Después de `npm run build`:

```powershell
npm run normalize -- synthetic-native-success
node dist/normalize-cli.js fixture synthetic-pending
```

Para datos live, de forma explícita: `npm run live:normalize -- <hash-real-de-transaccion-Sepolia>`.

`normalizeInvestigation` transforma datos del adapter en transaction, receipt, block y logs canónicos, manteniendo raw íntegro. Usa strings decimales para cantidades y distingue null de cero. Incluye fees derivadas cuando hay datos suficientes, DAG de evidencia con hashes/JSON Pointers y bundle_id determinístico. Un value declarado no prueba una transferencia efectiva; un log aún no es un evento decodificado. Los fixtures siguen identificados como synthetic.

La salida JSON es autocontenida y exportable. Para guardar sólo el bundle (sin los mensajes npm), usar `node dist/normalize-cli.js fixture synthetic-native-success > normalized.json`. La función pura no escribe archivos. No hay aún base persistente multi-investigación, claims ni reporte revisado. [Contrato M2](openspec/changes/normalize-transaction-evidence/design.md).

## Extracción de eventos M3

Después de `npm run build`:

```powershell
npm run extract -- synthetic-token-events
node dist/extract-cli.js fixture synthetic-token-events
```

La extracción reconoce únicamente layouts canónicos de `Transfer` ERC-20/ERC-721 y `TransferSingle`/`TransferBatch` ERC-1155. Conserva eventos desconocidos o malformados, expande lotes de forma atómica, etiqueta cada movimiento como `event_reported` y enlaza eventos, transferencias y grafo base con evidencia content-addressed. No calcula balances netos ni afirma que el contrato cumpla el estándar. ABI arbitrario, resolución de proxies y metadatos siguen pendientes; las trazas offline se describen abajo. [Contrato M3](openspec/changes/extract-standard-token-events/design.md).

## Trazas de llamadas offline

```powershell
npm run build
npm run calltrace -- synthetic-token-events
node dist/graph-cli.js fixture synthetic-token-events --with-trace > graph.html
```

Normaliza trazas `callTracer` sintéticas de `fixtures/call-traces/`, verificadas por checksum. Cada frame lleva `trace_path`, tipo de llamada, direcciones de contexto y de código, revert propio y ancestral, y evidencia content-addressed.

- Una subllamada revertida dentro de una transacción exitosa queda `reverted` sin marcar la transacción como fallida (`SUBCALL_REVERTED_TRANSACTION_SUCCEEDED`).
- Los frames bajo un ancestro revertido son `reverted_attempt` sin valor efectivo.
- El valor que hereda un `DELEGATECALL` no es una transferencia.
- Si la raíz revierte sin `revertReason`, la causa queda desconocida.
- Límites: 1000 frames y profundidad 64; al superarlos, la cobertura queda `partial`.

`npm run report -- synthetic-token-events --with-trace` hace que el reporte revisado consuma la traza:

- publica claims OBSERVED de subllamada revertida, de revert reason (sólo si el tracer la reporta) y de DELEGATECALL, citando la evidencia de cada frame;
- añade la anomalía OBSERVED `trace_reports_reverted_subcall`, que no es una acusación.

Sin traza, el reporte es idéntico byte a byte.

**Tracing live: configuración lista, ejecución pendiente de proveedor.** `src/adapters/tracing.ts` envía sólo `debug_traceTransaction` con `callTracer` fijo a un host HTTPS configurado por administrador. Está deshabilitado salvo una configuración local con `enabled: true` (ver `config/live-tracing.example.json`; `config/live-tracing.json` está en `.gitignore`) y no forma parte de la allowlist RPC principal. PublicNode no ofrece `debug_*`, y los proveedores que lo ofrecen suelen requerir cuenta o API key, así que no se ha ejecutado ninguna traza real. Con el adapter Sepolia, `trace_transaction` sigue `unavailable`. Pasos pendientes: [enable-live-tracing](openspec/changes/enable-live-tracing/proposal.md). [Contrato](openspec/changes/add-offline-call-traces/design.md).

## Identificación de contratos y proxies

```powershell
npm run build
npm run contract -- synthetic-proxy-known
npm run contract -- synthetic-proxy-upgraded
```

Identifica un contrato sólo con lecturas del bloque del caso:

- code hash;
- slot EIP-1967 de implementación, leído con `eth_getStorageAt` y sólo ese slot;
- un registro local de ABI con procedencia, indexado por code hash.

Un proxy actualizado cuya implementación nueva no está registrada queda con identidad `unknown` (`NO_HISTORICAL_ABI`); nunca se decodifica con la ABI de otra implementación ni se infiere identidad por dirección. `get_contract` del servidor MCP devuelve `proxy`, `implementation` e `identity` con evidencia en un snapshot fijado. El registro incluido es sintético.

## Versiones de corpus

```powershell
node dist/rag-admin-cli.js resolve corpus/snapshots <corpus_snapshot_id> <chunk_id>
```

`corpus/snapshots/index.json` es un registro append-only de snapshots con linaje por `canonical_uri`: `added`, `removed` y `new_version`. Cada snapshot nuevo se escribe en otro directorio con `rag-admin-cli build` y se añade con `rag-admin-cli register`. Una cita `(corpus_snapshot_id, chunk_id)` se resuelve contra el snapshot original, que se re-verifica entero.

## Servidor MCP read-only M4

El servidor local usa stdio y MCP 2026-07-28 mediante el SDK TypeScript v2. Expone exactamente `get_transaction`, `get_receipt`, `get_block`, `get_wallet_balance`, `get_token_transfers`, `get_contract`, `get_contract_events`, `trace_transaction` y `search_protocol_docs`. Con el adapter Sepolia, `trace_transaction` responde `unavailable` porque no hay tracing live; con un backend de trazas inyectado devuelve frames (ver Trazas de llamadas offline). La búsqueda documental usa el corpus local M5 y nunca navega la web durante una consulta.

```powershell
npm run build
npm run mcp
```

`npm run mcp` queda esperando mensajes MCP por stdin y reserva stdout para el protocolo. Para conectarlo desde Cursor, ejecutar primero el build y usar el manifest local versionado `.cursor/mcp.json`. En otro cliente, configurar `node` como comando y la ruta absoluta a `dist/mcp-cli.js` como argumento; no añadir parámetros RPC.

Las lecturas on-chain están fijadas a Sepolia (`11155111`) y al endpoint PublicNode incluido en el adapter. No hay HTTP remoto, endpoint configurable, persistencia, firma ni envío. Cada resultado usa un envelope versionado con snapshot, procedencia, cobertura, evidencia y paginación. `get_contract_events.data` contiene elementos `{raw, decoded}` para mantener separados el log observado y su interpretación derivada. Los rangos admiten como máximo 100 bloques inclusivos, las páginas 100 elementos y la respuesta serializada 2 MiB. Los cursores HMAC expiran y se ligan a tool, consulta y manifest de snapshots.

## Protocol RAG M5

El snapshot `corpus/snapshots/m5-v1` contiene 6 documentos y 139 chunks: EIP-20/721/1155, changelogs OpenZeppelin Contracts v4.9.4/v5.0.2 y la auditoría v5.0.0. Fuentes, modelo MiniLM ONNX cuantizado, vocabulario, documentos, chunks y vectores están fijados por SHA-256. BM25 y cosine se fusionan con RRF; cada hit conserva span exacto, versión, compatibilidad e identidad del snapshot.

```powershell
npm run rag:verify
npm run rag:eval
```

`rag:verify` funciona offline y verifica manifest, rutas, tamaños, hashes, dimensiones y spans. `rag:eval` ejecuta qrels versionados; la gate actual obtiene Recall@5 1,00, MRR@10 0,867, abstención 1,00 y compatibilidad de versión correcta. La ingesta administrativa es la única fase con red: `rag:fetch` acepta exclusivamente el lock allowlisted `corpus/sources.json`; búsqueda, MCP, tests y evaluación no descargan documentos ni modelos.

`search_protocol_docs` admite `query`, `protocol`, `version`, `chain_id` y `top_k≤10`. Los scores son ordinales, no probabilidades. Hits incompatibles se etiquetan `conflicting`; una consulta sin soporte devuelve `ok`, lista vacía y `NO_RELEVANT_DOCUMENTS`. El contenido recuperado no puede cambiar permisos ni ejecutar instrucciones, y M5 todavía no crea claims ni decide entailment final.

## Orquestación analítica M6

M6 añade baseline determinístico, Transaction Analyst, Contract Analyst, claims tipados y un orquestador que aplica allowlists por rol, snapshot único, evidencia resoluble, 24 tools, 20.000 tokens de entrada, 4.000 de salida, deadline de 90 s y una sola corrección de schema.

```powershell
npm run analyze -- synthetic-native-success
npm run agent:eval
```

No hay proveedor remoto habilitado ni secretos configurados. `analyze` produce offline el baseline como `inconclusive` con `MODEL_PROVIDER_NOT_CONFIGURED`; el provider scripted se usa sólo en tests/evals para verificar roles y presupuestos. La gate actual obtiene tool selection `1,00` en 5 casos y cero ejecuciones prohibidas.

La salida es un `analysis_draft`: claims OBSERVED/RULE-BASED del baseline y MODEL-INFERRED de analistas permanecen `proposed`. `complete` en M6 sólo significa finalización estructural, no aprobación; la revisión la hace M7.

## Revisión de evidencia y reporte M7

M7 continúa el mismo run con Evidence Agent y Reviewer internos, sin tools MCP, red ni filesystem, y publica un `reviewed_report` con estado `accepted`, `partial` o `inconclusive`.

```powershell
npm run report -- synthetic-reverted
npm run review:eval
```

Antes de cualquier modelo, los validadores determinísticos reconstruyen la evidencia desde la investigación y el journal de tools. Recalculan ids de claims y hashes del DAG y rechazan citas irresolubles, snapshots mezclados, documentos incompatibles, clases incoherentes, transferencias `event_reported` elevadas a saldo o propiedad, y atribuciones de fraude o intención. Los hallazgos de Evidence Agent y los validadores prevalecen sobre un Reviewer que apruebe. Sólo los claims `supported` aparecen como conclusiones; los rechazados quedan en auditoría con motivo.

`accepted` exige Evidence Agent y Reviewer completos, cero defectos, borrador M6 completo y evidencia verificable. Sin provider, `report` devuelve el baseline como hechos validados y el reporte queda `inconclusive`. Las anomalías sólo referencian claims publicados: por ahora, receipt revertido (OBSERVED) y umbral educativo de 20 eventos por receipt (RULE-BASED). Ninguna es una acusación, y el reporte siempre advierte `REVIEW_IS_NOT_A_SECURITY_AUDIT`.

## Grafo con evidencia M8

```powershell
npm run build
node dist/graph-cli.js fixture synthetic-token-events > graph.html
node dist/graph-cli.js fixture synthetic-reverted --json
```

La vista se construye desde la extracción M3 y el reporte M7. Sólo muestra relaciones observables: valor declarado por la transacción, logs emitidos y transferencias `event_reported`. Sin trazas declara `NO_CALL_TRACE` y no dibuja llamadas internas; con `--with-trace` añade aristas `internal_call` desde la traza sintética del fixture. Cada arista enlaza con un panel de evidencia (`#edge-<hash>`) y con los claims que la citan. Las aristas se marcan executed, reverted o unknown; más de 200 se truncan con aviso. El HTML es estático: SVG sin scripts, texto escapado y CSP `default-src 'none'`.

## Evaluación consolidada M9

```powershell
npm run eval
node dist/eval-cli.js run --repetitions 5 > a.json
node dist/eval-cli.js compare a.json b.json
node dist/eval-cli.js dashboard a.json > eval.html
```

El runner verifica los checksums de los fixtures y compara contra un golden escrito a mano (`evals/golden/fixtures.json`): tuplas de reconstrucción, eventos, orden de logs, anomalías y abstención sobre contratos no identificables, por familia y split. También ejecuta los evals de retrieval, tool policy y revisión como sub-suites. Cada métrica lleva numerador, denominador y estado `measured`, `N/A` o `unavailable`; una métrica N/A deja su gate `not_applicable`, nunca aprobada. Las gates de seguridad bloquean release aunque la calidad sea alta. `compare` sólo compara resultados con la misma `comparable_key` (fixtures, golden, evals y corpus). Tokens de modelo: `unavailable`, porque la suite offline no usa provider. La latencia es local y no es un SLA.

## Telemetría y retención local M10

```powershell
node dist/trace-cli.js fixture synthetic-reverted
node dist/trace-cli.js fixture synthetic-reverted --otlp
node dist/runs-cli.js record synthetic-reverted --profile demo
node dist/runs-cli.js list
node dist/runs-cli.js sweep
```

Con un tracer inyectado, cada run produce un `trace_id` y spans para run, análisis, llamadas de modelo, tools, revisión y llamadas de revisión, con versiones, budgets y códigos de error. No guarda la pregunta en claro (sólo su hash) ni prompts. Sin tracer el reporte es idéntico. La redacción elimina headers Bearer/Basic, claves con nombre sensible, userinfo de URLs, parámetros de query sensibles y claves en rutas de proveedores; no toca hashes ni direcciones. La exportación OTLP-JSON es local, sin collector ni red.

`RunStore` guarda reporte y traza por run en `.runs/` (ignorado por git). Retención: 30 días por defecto y 24 h con `--profile demo`. `sweep` borra expirados y corruptos. Rechaza raíces dentro de `fixtures`, `corpus`, `evals` o `demo` y la raíz del proyecto, así que borrar un run nunca toca datos públicos. Las cuotas por identidad quedan diferidas: la demo es estática y no acepta consultas.

## Demo pública M11 (workflow de Pages listo, sin publicar)

```powershell
npm run demo:site
```

Genera `dist-demo/` (ignorado por git) desde los fixtures curados en `demo/fixtures.json`: un índice con propósito, límites, privacidad y estado de las gates, una página por fixture con reporte revisado y grafo, y el dashboard de evaluación. No hay JavaScript, formularios, cookies, recursos externos, wallet ni consultas live, y cada página lleva CSP estricta. La build se niega si el runner M9 bloquea release, si un fixture no pasa sus checksums o si la auditoría del HTML encuentra contenido activo, URLs externas o enlaces rotos. Escribe un `manifest.json` con los hashes de cada archivo.

Publicación: `.github/workflows/pages.yml` (`Publish demo`, acciones fijadas por SHA) ejecuta en orden:

1. tests sin red;
2. el runner de evaluación, que bloquea si `release_blocked`;
3. la build con gates;
4. `node dist/demo-cli.js verify dist-demo` (hashes, archivos exactos y auditoría sobre disco);
5. el despliegue en GitHub Pages;
6. `scripts/verify-pages.mjs`, que compara cada página publicada byte a byte con el manifest y comprueba CSP y ausencia de secretos. Es el único camino que emite `published: true`.

URL prevista: https://manuxd270516.github.io/blockchain-transaction-intelligence/. **Todavía no se ha desplegado**: falta habilitar Pages (`build_type=workflow`) y hacer push. La CSP va en `<meta>` porque Pages no permite cabeceras propias.

## Estructura y límites

- `src/fixtures`: manifest validado, loader y verificación de integridad.
- `src/adapters`: contratos, fixture adapter, política RPC, transporte HTTPS y Ethereum adapter.
- `src/normalization`: normalizador puro, cantidades exactas y evidencia de fuentes/derivaciones.
- `src/events`: decodificador estricto, transferencias event-reported y grafo base.
- `src/contracts`: identificación de contrato/proxy EIP-1967 por bloque y registro de ABI con procedencia; `src/contract-cli.ts`.
- `src/runs/quota.ts`: cuotas por identidad (hash), inyectables en el orquestador.
- `src/rag/versions.ts`: registro de versiones de corpus y resolución de citas.
- `src/adapters/tracing.ts`: backend de tracing live deshabilitado por defecto.
- `src/traces`: loader de fixtures de traza y normalizador `call-trace/1.0.0`; `src/calltrace-cli.ts`.
- `src/rag`: loader de snapshots, WordPiece/MiniLM WASM y retrieval híbrido; las CLIs administrativas/eval están en `src/rag-*.ts`.
- `src/agents`: claims, baseline, provider interface y orquestador acotado; `src/analyze-cli.ts` ofrece replay analítico offline.
- `src/review`: índice de evidencia, validadores, schemas de Evidence Agent/Reviewer, anomalías y reporte revisado; `src/report-cli.ts` y `src/review-eval-cli.ts` son sus CLIs.
- `src/mcp`: dispatcher, schemas, envelopes, errores públicos y cursores autenticados; `src/mcp-cli.ts` es el entrypoint stdio.
- `src/graph`: vista de grafo, HTML compartido con CSP y render SVG; `src/graph-cli.ts`.
- `src/evals`: métricas, runner consolidado, gates, comparación y dashboard; `src/eval-cli.ts`.
- `src/telemetry` y `src/runs`: tracer, redacción, OTLP-JSON y store local con retención; `src/trace-cli.ts` y `src/runs-cli.ts`.
- `src/demo` y `demo/fixtures.json`: generador y auditoría del sitio estático; `src/demo-cli.ts`.
- `corpus`: allowlist fijada y snapshot inmutable M5; staging de ingesta no se versiona.
- `evals`: qrels, policy de tools, casos de revisión y golden de fixtures con sus gates.
- `.cursor/mcp.json`: configuración local del servidor compilado para clientes Cursor.
- `fixtures`: cuatro escenarios sintéticos versionados y sus checksums; `fixtures/call-traces` añade dos trazas sintéticas ligadas a ellos.
- `test`: oráculos, escenarios RPC sintéticos, pruebas de seguridad/consistencia.
- `scripts/generate-fixtures.mjs`: utilidad de mantenimiento; regenera los fixtures sintéticos, no se ejecuta durante replay.
- `.github/workflows/ci.yml`: suite Linux con namespace de red aislado. Corre en GitHub Actions en cada push (último registro: run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154)). `scripts/local-linux-ci.ps1` reproduce sus pasos en Docker local sin red.

Los hashes detectan cambios respecto al manifest, no prueban autenticidad del proveedor. Datos raw desconocidos no se ejecutan. Configurar el fixture root como sólo lectura en despliegue; el loader no es un sandbox contra procesos locales hostiles que cambien directorios concurrentemente. La procedencia live reside en la respuesta; su persistencia y el modelo completo de claims llegarán después.

## OpenSpec

Changes de implementación: [M0 bootstrap](openspec/changes/bootstrap-offline-foundation/proposal.md), [M1 adapter](openspec/changes/add-ethereum-readonly-adapter/proposal.md), [M2 normalización](openspec/changes/normalize-transaction-evidence/proposal.md), [M3 eventos](openspec/changes/extract-standard-token-events/proposal.md), [M4 MCP](openspec/changes/add-readonly-mcp-server/proposal.md), [M5 RAG](openspec/changes/add-versioned-protocol-rag/proposal.md), [M6 orquestación](openspec/changes/add-bounded-analysis-orchestrator/proposal.md), [M7 revisión](openspec/changes/add-evidence-review-pipeline/proposal.md), [M8 grafo](openspec/changes/add-evidence-graph-view/proposal.md), [M9 evaluación](openspec/changes/consolidate-evaluation-runner/proposal.md), [M10 observabilidad](openspec/changes/add-local-observability-retention/proposal.md), [M11 demo](openspec/changes/prepare-public-demo/proposal.md), [trazas de llamadas offline](openspec/changes/add-offline-call-traces/proposal.md) (archivados en `openspec/changes/archive/`). Abiertos: [publicación en Pages](openspec/changes/publish-demo-github-pages/proposal.md), [requisitos diferidos de la fundación](openspec/changes/complete-foundation-deferred-requirements/proposal.md) y [tracing live](openspec/changes/enable-live-tracing/proposal.md).

Primer change: [define-transaction-intelligence-foundation](openspec/changes/define-transaction-intelligence-foundation/proposal.md).

- [Arquitectura, alcance y dominio](openspec/changes/define-transaction-intelligence-foundation/design.md)
- [Threat model](openspec/changes/define-transaction-intelligence-foundation/threat-model.md)
- [Contrato MCP](openspec/changes/define-transaction-intelligence-foundation/mcp-contract.md)
- [Evidencia y claims](openspec/changes/define-transaction-intelligence-foundation/evidence-model.md)
- [RAG](openspec/changes/define-transaction-intelligence-foundation/rag-design.md)
- [Evaluaciones](openspec/changes/define-transaction-intelligence-foundation/evaluation-strategy.md)
- [Roadmap](openspec/changes/define-transaction-intelligence-foundation/roadmap.md)
- [Tareas futuras](openspec/changes/define-transaction-intelligence-foundation/tasks.md)

El diseño fija contratos objetivo M0–M11. Cada hito tuvo su propio change de implementación con criterios de aceptación antes de escribir código. Las tareas 2.1–2.12 están marcadas con la evidencia que las verifica.

Los changes de cada hito están archivados y sus specs promovidas a `openspec/specs/`. Siguen abiertos:

- este change de fundación, hasta registrar la CI remota de sus requisitos diferidos ya implementados;
- `prepare-public-demo` y `publish-demo-github-pages`, hasta publicar el sitio;
- `enable-live-tracing`, con configuración lista y ejecución pendiente de proveedor.
