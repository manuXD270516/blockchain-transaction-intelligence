# blockchain-transaction-intelligence

Plataforma analítica y educativa para investigar transacciones EVM mediante datos públicos, MCP, agentes y RAG con evidencia verificable.

**Estado: M0–M3 implementados y verificados localmente.** Hay replay offline, adapter Ethereum Sepolia de sólo lectura, normalización canónica y extracción estricta de eventos estándar con evidencia. M4–M11 siguen pendientes. No firma, custodia, invierte, despliega contratos ni mueve fondos, tampoco en testnet.

[Listado completo de funcionalidades y status](docs/feature-status.md) · [Validación M0–M3](docs/verification.md)

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

API interna: `EthereumAdapter.investigate`, `getBlock`, `getBalance`, `getCode`, `getLogs`; `FixtureAdapter.investigate` comparte contrato con modo synthetic. Logs M1 se consultan por dirección y un solo bloque. Historial completo, tracing, ABI y MCP no están implementados.

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

## Estructura y límites

- `src/fixtures`: manifest validado, loader y verificación de integridad.
- `src/adapters`: contratos, fixture adapter, política RPC, transporte HTTPS y Ethereum adapter.
- `src/normalization`: normalizador puro, cantidades exactas y evidencia de fuentes/derivaciones.
- `src/events`: decodificador estricto, transferencias event-reported y grafo base.
- `fixtures`: cuatro escenarios sintéticos versionados y sus checksums.
- `test`: oráculos, escenarios RPC sintéticos, pruebas de seguridad/consistencia.
- `scripts/generate-fixtures.mjs`: utilidad de mantenimiento; regenera los fixtures sintéticos, no se ejecuta durante replay.
- `.github/workflows/ci.yml`: suite Linux con namespace de red aislado; ejecución remota aún pendiente.

Los hashes detectan cambios respecto al manifest, no prueban autenticidad del proveedor. Datos raw desconocidos no se ejecutan. Configurar el fixture root como sólo lectura en despliegue; el loader no es un sandbox contra procesos locales hostiles que cambien directorios concurrentemente. La procedencia live reside en la respuesta; su persistencia y el modelo completo de claims llegarán después.

## OpenSpec

Changes de implementación: [M0 bootstrap](openspec/changes/bootstrap-offline-foundation/proposal.md), [M1 adapter](openspec/changes/add-ethereum-readonly-adapter/proposal.md), [M2 normalización](openspec/changes/normalize-transaction-evidence/proposal.md) y [M3 eventos](openspec/changes/extract-standard-token-events/proposal.md).

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
