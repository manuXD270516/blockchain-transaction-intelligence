## Why

El reporte revisado conserva journals y budgets, pero no hay una traza que correlacione run, analistas, tools y revisión con tiempos, ni redacción de secretos, ni almacenamiento local con retención y borrado. threat-model.md exige esa política verificada antes de la demo pública (M11).

## What Changes

- Añadir un tracer local inyectable: un `trace_id` por run y spans para run, análisis, llamadas de modelo por rol/fase, tools, revisión y llamadas de revisión, con versiones, budgets, estados y códigos de error. Sin prompts crudos ni pregunta en claro.
- Redactar secretos en atributos, errores y registros persistidos: headers Bearer, claves con nombre sensible, userinfo de URLs, parámetros de query sensibles y claves en rutas de proveedores. Hashes y direcciones públicas no se redactan.
- Exportar la traza como OTLP-JSON en archivo o stdout, sin collector ni red.
- Añadir `RunStore` local: guarda reporte y traza por run bajo un directorio ignorado por git, con ids hex, retención de 30 días por defecto (24 h en perfil demo), listado, lectura, borrado y barrido de expirados. Rechaza raíces que contengan o estén dentro de fixtures, corpus o evals.
- Añadir CLIs `trace` y `runs`.

## Capabilities

### New Capabilities

- `local-observability`: trazas correlacionadas, redacción, exportación OTLP-JSON y retención local de runs.

### Modified Capabilities

Ninguna. El orquestador y el pipeline aceptan telemetría opcional; sin ella su salida no cambia.

## Impact

Se añaden `src/telemetry`, `src/runs`, dos CLIs, tests y `.runs/` al gitignore. Sin dependencias nuevas, red ni collector. Las cuotas por identidad quedan diferidas: la demo M11 es estática y no acepta consultas; los budgets por run actúan como cuota local. Alertas remotas quedan fuera de alcance.
