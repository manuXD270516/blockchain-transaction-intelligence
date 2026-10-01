## Why

La fundación exige trazas conscientes de ejecución (transaction-normalization "Execution-aware traces"), aristas de llamada con contexto y código separados para `delegatecall` (transaction-graph) y respuestas de traza truncadas como `partial` (blockchain-mcp). M3, M4 y M8 las difirieron: `trace_transaction` devuelve `unavailable` y el grafo declara `NO_CALL_TRACE`. Sin trazas no se pueden verificar subllamadas revertidas dentro de una transacción exitosa, intentos bajo un ancestro revertido ni el valor de `delegatecall`, y la tarea 2.4 del change de fundación no puede cerrarse.

## What Changes

- Añadir un normalizador puro de trazas con formato `callTracer` que produce frames con `trace_path`, tipo de llamada, dirección de contexto y de código, valor declarado y efectivo, error observado, revert propio y ancestral, y evidencia content-addressed.
- Aplicar límites de frames y profundidad con cobertura `partial` y truncación explícita; exigir coherencia del frame raíz con la transacción y el receipt.
- Añadir fixtures de traza sintéticos versionados con checksums, ligados a fixtures M0 existentes (`synthetic-token-events` y `synthetic-reverted`), sin cambiar el manifest M0.
- Integrar trazas opcionales en la vista de grafo M8 (aristas `internal_call`) y en `trace_transaction` mediante un backend de trazas opcional. El adapter Sepolia sigue sin tracing: la tool continúa `unavailable` en live.
- Añadir CLI offline `calltrace`.

## Capabilities

### New Capabilities

- `offline-call-traces`: normalización de trazas de llamadas desde fixtures/backends inyectados, con evidencia, límites y semántica de revert.

### Modified Capabilities

Ninguna capability archivada cambia de autoridad. La vista de grafo y la tool `trace_transaction` aceptan trazas opcionales; sin traza su salida es idéntica a la actual.

## Impact

Se añaden `src/traces`, fixtures en `fixtures/call-traces/`, una CLI y tests. Sin dependencias nuevas, sin métodos RPC nuevos (no se añade `debug_traceTransaction` a la allowlist) y sin red. El reporte revisado M7 no consume trazas en este change; la diferenciación entre receipt exitoso y subllamada revertida se expone en la salida de traza y en el grafo.
