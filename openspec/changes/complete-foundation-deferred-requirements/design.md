# Diseño — Requisitos diferidos de la fundación

## 1. Reporte revisado con trazas

`AnalysisInput.call_trace?: CallTrace`. Antes de usarla, `buildBaseline(investigation, trace)` verifica:

- que `trace.tx_id` y `chain_id` coinciden con la investigación normalizada;
- que el `trace_id` recalculado coincide.

Si falla, `INCONSISTENT_TRACE`.

Claims OBSERVED del baseline, con un máximo de 50:

- **Subllamada revertida.** Por cada frame con `own_reverted` y profundidad > 0, cuando la transacción tuvo éxito. Texto: "The call trace reports an error in the <TYPE> at trace_path <p> while the receipt reports success." Cita el frame y el receipt. Limitaciones: dato reportado por tracer; intento revertido, no movimiento efectivo.
- **Revert reason.** Sólo si la raíz revierte y el tracer reporta `revertReason`. Si no hay razón, no hay claim: la limitación de causa desconocida ya existe.
- **DELEGATECALL.** Por cada DELEGATECALL: "The call trace reports a DELEGATECALL at trace_path <p> running code at <code> in the context of <context>; its declared value is not a separate transfer."

La evidencia de traza (nodo raw y frames) se añade al conjunto de evidencia del baseline. `buildEvidenceIndex` recibe la misma traza, incluye sus nodos en el DAG verificado y exige que `draft.baseline.trace_id` coincida.

El draft guarda `baseline.trace_id` sólo si hay traza, para que el `draft_id` sin traza no cambie. La limitación de llamadas internas cambia de texto sólo con traza: "Internal calls are tracer-reported frames; ...". Anomalía OBSERVED `trace_reports_reverted_subcall`, ligada a los claims de subllamada revertida publicados.

## 2. Cuotas por identidad

`RunQuota({ window_ms, max_runs, max_concurrent, now })`:

- La identidad es una string de 1–200 caracteres que se almacena como `sha256`, nunca en claro.
- `acquire(identity)` devuelve un `release` o lanza `QuotaError('RATE_LIMITED', retry_after_ms)`.
- La ventana es fija por identidad. Las entradas expiradas se purgan, con un máximo de 10.000 identidades; por encima se rechaza con `RATE_LIMITED`.

El orquestador acepta `quota` e `identity` opcionales. Con cuota y sin identidad lanza `INVALID_INPUT`. La cuota se adquiere antes de cualquier trabajo y se libera en `finally`.

Como no hay un servicio con visitantes, la cuota se ofrece como librería verificada para el futuro transporte remoto. La demo estática no la necesita.

## 3. Versiones de corpus

`corpus/snapshots/index.json`:

```
{ schema_version: '1.0.0',
  snapshots: [{ corpus_snapshot_id, path, created_at,
                documents: [{ document_id, canonical_uri, content_hash, version }] }] }
```

- `registerSnapshot(registry, corpus, path)` es puro y append-only:
  - rechaza un id o una ruta ya registrados (`SNAPSHOT_ALREADY_REGISTERED`);
  - rechaza una ruta que no sea `^[a-z0-9][a-z0-9.-]{0,63}$`;
  - calcula `changes` contra el último snapshot: `added`, `removed` y `new_version`, este último cuando la misma `canonical_uri` tiene otro `content_hash`.
- `resolveCitation(snapshotsRoot, registry, { corpus_snapshot_id, chunk_id })`:
  1. Busca el snapshot por id; si no está, `CITATION_SNAPSHOT_NOT_FOUND`.
  2. Lo carga con `loadCorpus`, que verifica integridad.
  3. Devuelve documento, versión, span y excerpt; si el chunk no está, `CITATION_NOT_FOUND`.
- CLIs: `rag-admin-cli register <snapshots-root> <path>` y `rag-admin-cli resolve <snapshots-root> <snapshot_id> <chunk_id>`.

Se registra `m5-v1` como primera versión. La build ya escribe cada snapshot en un directorio nuevo con `wx`, así que una versión no puede sobrescribir otra.

## 4. Identificación de contratos

Slot EIP-1967 de implementación: `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`.

`identifyContract({ chain_id, address, block_hash, code, implementation_slot, implementation_code }, registry)` produce `contract-identification/1.0.0`:

- `code_sha256` es el sha256 del hex del bytecode, igual que `get_contract`.
- `proxy`:
  - `none` si el slot es cero o no se leyó porque no hay código;
  - `eip1967` con `implementation` si el slot contiene una dirección de 20 bytes con los 12 bytes altos en cero;
  - `unknown` si el slot no fue leído o es malformado.
- `identity`: entrada del registro cuyo `code_sha256` coincide con el código efectivo, que es el de la implementación si hay proxy. Si no coincide, `unknown` con motivo `NO_HISTORICAL_ABI` para un proxy o `NO_REGISTERED_CODE`.
- Nunca se usa el nombre de una dirección, y no se decodifica con una ABI de otra implementación.

El registro `fixtures/contracts/abi-registry.json` se valida estrictamente: `code_sha256`, `name`, `version`, ABI de eventos, `abi_sha256` y `provenance` (`synthetic`, licencia). Los fixtures `fixtures/contracts/<id>/manifest.json + state.json` llevan checksums y se generan con `generate-fixtures.mjs`:

- `synthetic-proxy-known`: proxy a la implementación v1, que está registrada.
- `synthetic-proxy-upgraded`: el mismo proxy en un bloque posterior apunta a v2, que no está registrada, así que la identidad queda unknown.
- `synthetic-plain-contract`: sin proxy y código no registrado.

El adapter Sepolia añade `getStorageAt(address, ref)`, con el slot fijado en el adapter y la allowlist RPC aceptando `eth_getStorageAt` sólo con ese slot. `get_contract` usa `getStorageAt` y `getCode` de la implementación cuando el backend lo implementa, y devuelve `proxy`, `implementation` e `identity` con evidencia y snapshot. Si el backend no lo implementa, conserva `null` como hoy.

## 5. Tracing live como configuración

`src/adapters/tracing.ts`:

- `LiveTraceConfig { enabled: boolean, provider_id, endpoint_host, timeout_ms ≤ 20000 }` se valida estrictamente. `endpoint_host` es un hostname DNS sin esquema, ruta ni credenciales.
- `createLiveTraceBackend(config, transport?)` lanza `LIVE_TRACING_DISABLED` si `enabled` no es `true`.
- `traceTransaction(hash)` envía exactamente `debug_traceTransaction [hash, {"tracer":"callTracer"}]` y devuelve `Evidence` con `provider_id` y el método.
- Errores -32601 → `UNSUPPORTED_CAPABILITY`. Tamaño máximo 2 MiB.
- El transporte HTTPS real fija el host configurado, IPv4 pública y sin redirects, reutilizando la política M1.

`config/live-tracing.example.json` lleva `enabled: false` y un host de ejemplo. No se lee ninguna variable de entorno con secretos: un proveedor con API key en la URL o en cabeceras queda fuera hasta `enable-live-tracing`. No hay CLI live de tracing en este change.

## Verificación

Tests offline para:

- reporte con y sin traza: igualdad byte a byte sin traza, claims y anomalía con traza, traza ajena rechazada;
- cuota: límite, concurrencia, ventana, identidad hasheada y run no ejecutado;
- registro de corpus: v1, v2 derivado en un temporal con un documento cambiado, cita v1 que sigue resolviendo, id duplicado y ruta inválida;
- identificación: los tres fixtures, slot malformado, checksum adulterado y `get_contract` con RPC simulado, incluido `eth_getStorageAt` con otro slot denegado;
- tracing: deshabilitado por defecto, request exacto, host inválido y -32601.

Además, `npm run check`, evals sin cambios de `result_id` y OpenSpec estricto.
