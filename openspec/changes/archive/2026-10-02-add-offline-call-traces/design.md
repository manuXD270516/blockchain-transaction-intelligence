# Diseño — Trazas de llamadas offline

## Alcance y límites de confianza

Entrada: una traza con formato `callTracer` de go-ethereum (`type`, `from`, `to`, `value`, `gas`, `gasUsed`, `input`, `output`, `error`, `revertReason`, `calls`) junto a la `Investigation` de la misma transacción. La traza es un dato reportado por un tracer: no se reejecuta la EVM ni se prueba su exactitud. Claves no reconocidas, tipos desconocidos o campos mal formados rechazan la traza con `INVALID_TRACE`; no se aceptan trazas parciales silenciosas.

No se añade tracing live. El adapter Sepolia/PublicNode no expone `debug_*` y la allowlist RPC no cambia; `trace_transaction` sólo responde con traza cuando el backend MCP inyectado implementa `traceTransaction` (tests y fixtures). En live sigue `unavailable`/`UNSUPPORTED_CAPABILITY`.

## Coherencia

- El frame raíz debe coincidir con la transacción: `from`, `to` (o creación), `value` e `input`.
- Requiere receipt y snapshot. Error en la raíz si y sólo si el receipt reporta status `0x0`; si no, `INCONSISTENT_TRACE`.
- La traza se liga al snapshot de la investigación: el fixture declara `tx_hash`, `block_hash` y `block_number`, y deben coincidir.

## Modelo de frame (`call-trace/1.0.0`)

- `trace_path`: índices desde la raíz (`[]` raíz, `[0,1]` segundo hijo del primer hijo); `depth`.
- `call_type`: CALL, STATICCALL, DELEGATECALL, CALLCODE, CREATE, CREATE2, SELFDESTRUCT.
- `caller`, `target`, `context_address` y `code_address`. En DELEGATECALL y CALLCODE el contexto es el caller y el código el target; en el resto ambos son el target.
- `value_declared_wei`: decimal exacto o null si el tracer no lo reporta.
- `value_semantics`:
  - `not_a_transfer` para DELEGATECALL y STATICCALL; el valor heredado no es una transferencia nueva.
  - `reverted_attempt` si el frame o un ancestro revierte.
  - `executed_frame` en otro caso.
- `native_value_effective_wei`: sólo con `executed_frame`; si no, null.
- `error_observed`: texto del tracer, acotado a 1024 caracteres. `revert_reason` sólo si el tracer reporta `revertReason`; si no, null y la causa es desconocida.
- `own_reverted`, `ancestor_reverted` y `status`: `executed` o `reverted`.
- `evidence_ids`: nodo derivado con padre en el nodo raw de la traza y JSON Pointer al frame.

## Límites y truncación

Por defecto, máximo 1000 frames en preorden y profundidad 64; ambos son configurables a la baja en tests. Los frames excedentes se omiten. La cobertura queda `partial` con `total_frames`, `kept_frames`, `omitted_frames` y `TRACE_TRUNCATED`, sin afirmar secuencia completa. El raw está acotado a 2 MiB.

## Resumen

`transaction_status` viene del receipt y `reverted_subcalls` lista los `trace_path` con revert propio y profundidad > 0. Las advertencias incluyen:

- `SUBCALL_REVERTED_TRANSACTION_SUCCEEDED` cuando la transacción tuvo éxito con subllamadas revertidas.
- `REVERT_REASON_UNKNOWN` cuando la raíz revierte sin `revertReason`.
- `DELEGATECALL_VALUE_IS_NOT_A_TRANSFER`.
- `TRACE_IS_TRACER_REPORTED`.
- `SYNTHETIC_DATA_NOT_A_PUBLIC_TRANSACTION` en fixtures.

## Evidencia

Nodo raíz `fixture_materialized` (o `rpc_raw` para backends) con la fuente raw de la traza, más un nodo `derived` por frame con `transformation = call-trace/1.0.0`. Los ids se calculan con la misma canonicalización que M2/M3. La salida está deep-frozen y tiene `trace_id` determinístico.

## Fixtures

`fixtures/call-traces/<fixture-id>/manifest.json` y `trace.json`, generados por `scripts/generate-fixtures.mjs` con SHA-256 y bytes. El loader reutiliza las protecciones M0: contención de rutas, archivos regulares, límite de tamaño, JSON estricto e integridad.

- `synthetic-token-events`: raíz exitosa con un DELEGATECALL que hereda valor, una subllamada revertida capturada con una llamada interna bajo ancestro revertido, y un STATICCALL.
- `synthetic-reverted`: raíz revertida sin razón con una llamada interna que queda `reverted_attempt`.

## Integración

- Grafo M8: `buildGraphView(extraction, report, limit, trace?)`. Con traza, `call_trace_available=true`, aristas `internal_call` caller→target para frames de profundidad ≥ 1, con estado executed/reverted. Los nodos se etiquetan `delegatecall-context`/`delegatecall-code`, y avisos de traza y revert sustituyen `NO_CALL_TRACE`. Sin traza, la vista es byte a byte la misma.
- MCP: `trace_transaction` usa `backend.traceTransaction` si existe y devuelve `ok`, `partial` (truncada) o `not_found`. Si no existe, `unavailable` como hoy.
- CLI: `node dist/calltrace-cli.js fixture <fixture-id>` y `node dist/graph-cli.js fixture <fixture-id> --with-trace`.

## Verificación

Tests offline:

- Fixture con subllamada revertida en transacción exitosa.
- DELEGATECALL con contexto y código, y valor no efectivo.
- Ancestro revertido y raíz revertida sin razón.
- Truncación por frames y profundidad.
- Raíz incoherente, receipt incoherente, claves desconocidas y checksum adulterado.
- Determinismo y freeze.
- Grafo con aristas internas, sin regresión sin traza, y escape del texto de error.
- MCP con backend de trazas `ok`/`partial` y sin backend `unavailable`.
- CLI bajo guard offline.
- Regeneración de fixtures sin diff.
