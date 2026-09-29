## Especificación

- [x] 1.1 Fijar spans, redacción, OTLP-JSON, store, retención y cuotas diferidas.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Implementar redacción idempotente con tests de credenciales y datos públicos.
- [x] 2.2 Implementar tracer con AsyncLocalStorage, límites, contadores y exportación OTLP-JSON.
- [x] 2.3 Instrumentar orquestador y pipeline con telemetría opcional sin cambiar el reporte.
- [x] 2.4 Implementar RunStore con raíz segura, ids hex, retención, borrado y barrido.
- [x] 2.5 Añadir CLIs `trace` y `runs`, `.runs/` en gitignore y tests offline.
- [x] 2.6 Refrescar Graphify y actualizar README, status y verificación.

## Entorno

- [ ] 3.1 CI Linux remota. Omitida por decisión del usuario el 2026-09-29.
