# blockchain-transaction-intelligence

Plataforma analítica y educativa para investigar transacciones EVM mediante datos públicos, MCP, agentes y RAG con evidencia verificable.

**Estado: M0–M5 implementados y verificados local y remotamente.** Hay replay offline, adapter Ethereum Sepolia de sólo lectura, normalización canónica, extracción estricta de eventos estándar, servidor MCP stdio y retrieval documental versionado. M6–M11 siguen pendientes. No firma, custodia, invierte, despliega contratos ni mueve fondos, tampoco en testnet.

[Listado completo de funcionalidades y status](docs/feature-status.md) · [Validación M0–M5](docs/verification.md)

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

La extracción reconoce únicamente layouts canónicos de `Transfer` ERC-20/ERC-721 y `TransferSingle`/`TransferBatch` ERC-1155. Conserva eventos desconocidos o malformados, expande lotes de forma atómica, etiqueta cada movimiento como `event_reported` y enlaza eventos, transferencias y grafo base con evidencia content-addressed. No calcula balances netos ni afirma que el contrato cumpla el estándar. ABI arbitrario, proxies, metadatos y trazas siguen pendientes. [Contrato M3](openspec/changes/extract-standard-token-events/design.md).

## Servidor MCP read-only M4

El servidor local usa stdio y MCP 2026-07-28 mediante el SDK TypeScript v2. Expone exactamente `get_transaction`, `get_receipt`, `get_block`, `get_wallet_balance`, `get_token_transfers`, `get_contract`, `get_contract_events`, `trace_transaction` y `search_protocol_docs`. Tracing continúa respondiendo `unavailable`; la búsqueda documental usa el corpus local M5 y nunca navega la web durante una consulta.

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

## Estructura y límites

- `src/fixtures`: manifest validado, loader y verificación de integridad.
- `src/adapters`: contratos, fixture adapter, política RPC, transporte HTTPS y Ethereum adapter.
- `src/normalization`: normalizador puro, cantidades exactas y evidencia de fuentes/derivaciones.
- `src/events`: decodificador estricto, transferencias event-reported y grafo base.
- `src/rag`: loader de snapshots, WordPiece/MiniLM WASM y retrieval híbrido; las CLIs administrativas/eval están en `src/rag-*.ts`.
- `src/mcp`: dispatcher, schemas, envelopes, errores públicos y cursores autenticados; `src/mcp-cli.ts` es el entrypoint stdio.
- `corpus`: allowlist fijada y snapshot inmutable M5; staging de ingesta no se versiona.
- `evals`: qrels versionados y gates de retrieval.
- `.cursor/mcp.json`: configuración local del servidor compilado para clientes Cursor.
- `fixtures`: cuatro escenarios sintéticos versionados y sus checksums.
- `test`: oráculos, escenarios RPC sintéticos, pruebas de seguridad/consistencia.
- `scripts/generate-fixtures.mjs`: utilidad de mantenimiento; regenera los fixtures sintéticos, no se ejecuta durante replay.
- `.github/workflows/ci.yml`: suite Linux con namespace de red aislado, ejecutada remotamente en GitHub Actions.

Los hashes detectan cambios respecto al manifest, no prueban autenticidad del proveedor. Datos raw desconocidos no se ejecutan. Configurar el fixture root como sólo lectura en despliegue; el loader no es un sandbox contra procesos locales hostiles que cambien directorios concurrentemente. La procedencia live reside en la respuesta; su persistencia y el modelo completo de claims llegarán después.

## OpenSpec

Changes de implementación: [M0 bootstrap](openspec/changes/bootstrap-offline-foundation/proposal.md), [M1 adapter](openspec/changes/add-ethereum-readonly-adapter/proposal.md), [M2 normalización](openspec/changes/normalize-transaction-evidence/proposal.md), [M3 eventos](openspec/changes/extract-standard-token-events/proposal.md), [M4 MCP](openspec/changes/add-readonly-mcp-server/proposal.md) y [M5 RAG](openspec/changes/add-versioned-protocol-rag/proposal.md).

Primer change: [define-transaction-intelligence-foundation](openspec/changes/define-transaction-intelligence-foundation/proposal.md).

- [Arquitectura, alcance y dominio](openspec/changes/define-transaction-intelligence-foundation/design.md)
- [Threat model](openspec/changes/define-transaction-intelligence-foundation/threat-model.md)
- [Contrato MCP](openspec/changes/define-transaction-intelligence-foundation/mcp-contract.md)
- [Evidencia y claims](openspec/changes/define-transaction-intelligence-foundation/evidence-model.md)
- [RAG](openspec/changes/define-transaction-intelligence-foundation/rag-design.md)
- [Evaluaciones](openspec/changes/define-transaction-intelligence-foundation/evaluation-strategy.md)
- [Roadmap](openspec/changes/define-transaction-intelligence-foundation/roadmap.md)
- [Tareas futuras](openspec/changes/define-transaction-intelligence-foundation/tasks.md)

El diseño fija contratos objetivo M0–M11; no afirma que estén implementados. Cada hito requiere un change de implementación con deltas y criterios de aceptación antes de escribir código. Este change permanece abierto; no archivar como completado mientras sus requisitos carezcan de verificación.
