## Why

El change de fundación `define-transaction-intelligence-foundation` tiene sus tareas marcadas, pero varios de sus requisitos quedaron diferidos:

- El reporte revisado no distingue subllamadas revertidas porque no consume trazas (transaction-normalization, "Subllamada fallida capturada").
- No hay cuotas por identidad (mcp-contract: "demo ajustará cuota por identidad"; roadmap M10).
- El versionado del corpus está especificado ("una fuente cambia"), pero no hay registro de versiones ni resolución de citas contra snapshots anteriores.
- `get_contract` devuelve proxy, implementación e identidad siempre null. No hay resolución de proxy ni ABI con procedencia (design: ContractArtifact; mcp-contract: `eth_getStorageAt` sólo para proxy histórico).
- No existe camino de configuración para tracing live (`debug_traceTransaction` con tracer fijo).

Todo lo anterior puede implementarse sin servicios de pago, salvo ejecutar tracing live, que suele requerir un proveedor RPC con métodos `debug_*`. Ese paso queda en el change `enable-live-tracing`.

## What Changes

- **Reporte con trazas.** `runReviewed` acepta una traza `call-trace/1.0.0` opcional. El baseline añade claims OBSERVED sobre subllamadas revertidas, revert reason reportado y DELEGATECALL, citando la evidencia de cada frame. La revisión verifica esa evidencia en su DAG y se añade la anomalía OBSERVED `trace_reports_reverted_subcall`. Sin traza, el reporte es byte a byte el mismo.
- **Cuotas por identidad.** `RunQuota`, en memoria, con identidad hasheada, ventana fija, límite de runs y de concurrencia. Se inyecta opcionalmente en el orquestador y, cuando se agota, devuelve `RATE_LIMITED` sin ejecutar el run.
- **Versiones de corpus.** Registro append-only `corpus/snapshots/index.json` con linaje por `canonical_uri`, más un resolvedor de citas `(corpus_snapshot_id, chunk_id)` que carga y verifica el snapshot citado. Se añaden dos CLIs administrativas: `rag:register` y `rag:resolve`.
- **Identificación de contratos.** `identifyContract` es determinístico:
  - code hash por bloque;
  - proxy EIP-1967 leído del slot de implementación en ese bloque;
  - ABI sólo desde un registro local con procedencia, por code hash.

  Sin prueba histórica, la identidad queda `unknown`. El adapter Sepolia añade `getStorageAt`, limitado al slot EIP-1967 de implementación. `get_contract` lo usa para devolver proxy, implementación e identidad con evidencia. Hay fixtures sintéticos de proxy conocido, proxy actualizado sin ABI histórica y contrato sin proxy.
- **Tracing live como configuración.** `LiveTraceBackend`, deshabilitado por defecto, con tracer fijo `callTracer` y método `debug_traceTransaction`. La política propia admite host HTTPS por allowlist, timeout de 20 s y 2 MiB. Se añade `config/live-tracing.example.json`. Sin configuración explícita no hace llamadas, y los tests usan transporte simulado.

## Capabilities

### New Capabilities

- `contract-identification`: identificación de contrato, proxy e implementación por bloque, con ABI desde un registro con procedencia.

### Modified Capabilities

- `evidence-review-pipeline`: trazas opcionales en el reporte revisado.
- `local-observability`: cuotas por identidad.
- `versioned-protocol-rag`: registro de versiones y resolución de citas.
- `ethereum-readonly-adapter`: lectura del slot EIP-1967 y backend de tracing live deshabilitado por defecto.

## Impact

Se añaden `src/contracts`, `src/runs/quota.ts`, `src/rag/versions.ts`, `src/adapters/tracing.ts`, fixtures `fixtures/contracts/`, configuración de ejemplo, CLIs y tests. Sin dependencias nuevas ni llamadas reales. La allowlist RPC principal añade sólo `eth_getStorageAt` con slot fijo. `debug_traceTransaction` nunca entra en esa allowlist: vive en el backend de tracing separado y deshabilitado.
