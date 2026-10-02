## Why

M3 construye un grafo base y M7 publica un reporte revisado, pero no hay forma de inspeccionar visualmente las relaciones con su evidencia. M8 añade esa vista sin convertir relaciones reportadas en llamadas internas ni ejecutar contenido no confiable.

## What Changes

- Añadir un modelo de vista de grafo determinístico derivado de la extracción M3 y del reporte M7: nodos chain-qualified, aristas tipadas con estado `executed|reverted|unknown`, orden parcial y evidence_ids.
- Distinguir `transaction_declared`, `emits`, `inconsistent_log_reported` y `token_transfer_reported`; sin trazas no se crean aristas de llamadas internas.
- Renderizar HTML estático autocontenido, sin JavaScript ni recursos externos, con CSP `default-src 'none'`, texto escapado y un enlace de cada arista a su panel de evidencia.
- Mostrar alcance, truncación visual (máximo 200 aristas), revert, unknown y semántica event_reported.
- Añadir CLI offline `graph` que escribe el HTML en stdout.

## Capabilities

### New Capabilities

- `evidence-graph-view`: modelo de vista y renderizado seguro del grafo con evidencia.

### Modified Capabilities

Ninguna. M8 consume la extracción M3 y el reporte M7 sin cambiar su autoridad.

## Impact

Se añaden `src/graph`, una CLI y tests de XSS, truncación y estados. No se añade React ni dependencias: la vista es HTML/SVG estático. No hay servidor, red, persistencia ni wallet connection.
