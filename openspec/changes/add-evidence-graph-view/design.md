# Diseño M8 — Vista de grafo con evidencia

## Decisión de stack

La fundación proponía React para M8. Se sustituye por HTML/SVG estático generado en TypeScript: la vista no necesita interacción de estado, evita dependencias nuevas y elimina el vector de scripts. La inspección de evidencia se hace con anclas internas (`#edge-<hash>`), no con JavaScript. Un cambio a React requiere un change propio.

## Modelo de vista

`GraphView` (schema 1.0.0) se deriva de `extractTokenEvents` y del `ReviewedReport`:

- Nodos: transacción y direcciones con id `chain:address:0x…`, roles observados e identidad `unknown`.
- Aristas:
  - `transaction_declared`: from→to con `value_wei` declarado; no prueba transferencia efectiva. Creación usa destino `contract-creation`.
  - `emits`: transacción→emisor por cada log.
  - `inconsistent_log_reported`: log presente en receipt revertido.
  - `token_transfer_reported`: from→to por transferencia M3, semántica `event_reported`.
- Estado de arista: `executed` si receipt success, `reverted` si reverted, `unknown` sin receipt. Las transferencias bajo receipt revertido no existen (M3 las marca inconsistent).
- Orden parcial: `transaction_declared` en 0; logs y transferencias por `log_index` y `batch_index`. Sin trazas, `call_trace_available=false` y aviso explícito de que no hay orden causal ni llamadas internas.
- Evidencia: cada arista lista evidence_ids con kind/transformation del DAG M2/M3 y los claims del reporte que citan esa evidencia con su review_status.

Truncación: máximo 200 aristas visuales, ordenadas por orden parcial e id. La vista declara `total`, `shown` y `omitted` y el aviso de que la omisión no prueba ausencia de otras interacciones.

## Renderizado seguro

- Documento autocontenido con `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`.
- Sin `<script>`, handlers `on*`, `src`, URLs externas ni `javascript:`; sólo `href="#…"`.
- Todo texto pasa por escape de `& < > " '`. Ids de anclas son hashes hex de ids de arista, nunca texto crudo.
- Layout determinístico: transacción a la izquierda, direcciones en columna ordenada; coordenadas enteras.
- Leyenda visible de estados, semántica event_reported, límites y advertencia `REVIEW_IS_NOT_A_SECURITY_AUDIT`.

## Verificación

Tests: grafo sin trazas no crea aristas de llamada; revert y unknown visibles; event_reported visible; etiqueta con `<script>` y atributos maliciosos queda inerte; ausencia de recursos externos; truncación con 250 aristas; determinismo; CLI offline bajo guard.
