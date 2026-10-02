## Context

M6/M7 ya limitan tiempo, tokens, llamadas y correcciones, y el reporte guarda journals de tools y revisión. Falta correlación temporal entre fases, redacción centralizada y un ciclo de vida de los runs locales. La evaluación (M9) no depende de telemetría.

## Decisions

**Tracer.** `Tracer` genera `trace_id` (32 hex) y `span_id` (16 hex) con `crypto.randomBytes`; tests inyectan un generador y un reloj. El span activo se propaga con `AsyncLocalStorage`, así las llamadas secuenciales anidan sin pasar parents a mano. Spans: `run` (raíz), `analysis`, `analyst.model` (role, phase, prompt_version, tokens), `tool.call` (tool, status, error_code), `review`, `review.model` (role, phase, prompt_version, tokens). La raíz registra chain_id, bloque, tx hash, `question_sha256`, versiones de política, provider manifest id, estado e id del reporte, budgets usados/restantes y número de warnings. Un span que lanza guarda `status=error`, el código (`error.code` si es mayúsculas o el nombre de la clase) y el mensaje redactado, y relanza. Límites: 256 spans por traza (exceso cuenta en `dropped_spans`), 64 atributos por span, 512 caracteres por valor. `counters` cuenta una vez cada código de error de span (excepciones y `error_code` de tools); los warnings del reporte van como lista en el atributo raíz `warning_codes` para no contarlos dos veces.

**Integración.** `OrchestratorOptions.telemetry` y `ReviewOptions.telemetry` son opcionales. Sin tracer se usa uno nulo y el reporte es idéntico byte a byte; la telemetría nunca entra en `report_id` ni en `draft_id`.

**Redacción.** `redact(value)` recorre objetos: claves exactas sensibles (`authorization`, `cookie`, `set-cookie`, `password`, `secret`, `token`, `access_token`, `refresh_token`, `api_key`, `apikey`, `x-api-key`, `private_key`, `client_secret`) se sustituyen por `[REDACTED]`. En strings: `Bearer <valor>`, `Basic <valor>`, userinfo `scheme://user:pass@`, parámetros de query sensibles y pares `clave=valor`/`clave: valor` con esos nombres, y segmentos de clave en rutas `https://host/v<n>/<clave>` de 16+ caracteres sin prefijo `0x`. No se redactan hashes ni direcciones `0x…` porque una clave privada hex no se distingue de un hash; por eso las claves privadas nunca deben llegar a la telemetría. La redacción es idempotente.

**OTLP-JSON.** `toOtlpJson(trace)` produce `resourceSpans/scopeSpans/spans` con ids hex, tiempos en nanosegundos como string, atributos tipados y `status.code` 1/2. No hay exporter de red.

**RunStore.** Raíz por defecto `<proyecto>/.runs` (gitignored). El constructor resuelve la ruta y rechaza con `UNSAFE_STORE_ROOT` si es igual a, está dentro de o contiene `fixtures`, `corpus`, `evals` o `demo` del proyecto, o es la raíz del proyecto. Cada run vive en `<root>/<run_id>/record.json` con `run_id` = trace_id; se escribe a un temporal y se renombra. Registro: `schema_version`, `run_id`, `profile`, `created_at_ms`, `expires_at_ms`, `source {kind: fixture, fixture_id}`, `report`, `trace`; todo pasa por `redact`. `list` ignora entradas que no son ids hex y marca corruptas; `get`/`delete` validan el id antes de tocar el disco; `sweep` borra expirados y corruptos. Retención: `local` 30 días, `demo` 24 h; configurable entre 1 minuto y 365 días. Borrar un run elimina sólo su directorio.

**Cuotas.** Sin transporte remoto ni ingesta de visitantes no hay identidad que limitar. Se documenta como diferido hasta que un change exponga un servicio; los budgets por run y el límite de runs locales siguen vigentes.

## Risks / Trade-offs

- Redacción basada en patrones: puede omitir formatos desconocidos. Mitigación: los errores públicos ya son códigos; los mensajes sólo aparecen redactados en spans.
- `AsyncLocalStorage` con llamadas concurrentes a spans hermanos funcionaría, pero hoy todo es secuencial.
- Tiempos de spans dependen del reloj local; no son SLA.
