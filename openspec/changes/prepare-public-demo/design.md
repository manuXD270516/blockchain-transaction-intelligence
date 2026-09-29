## Context

Ya existen: reporte revisado (M7), vista de grafo HTML inerte (M8), runner con gates y dashboard (M9) y telemetría/retención local (M10). La demo no debe aceptar entrada del visitante, así que no necesita servidor, autenticación ni cuotas.

## Decisions

**Selección curada.** `demo/fixtures.json` (`schema_version`, `demo_version`, `fixtures[{fixture_id, title, lesson}]`) se valida con zod estricto; ids únicos con el patrón de fixtures, título ≤ 120 y lección ≤ 1000 caracteres, sin URLs absolutas o ejecutables (`INVALID_DEMO_CONFIG`); el HTML se escapa al renderizar. Cada fixture se carga con verificación de checksums; si alguno falla, la build termina con `INVALID_DEMO_FIXTURE`.

**Contenido.** Cada página de fixture ejecuta `runReviewed` sin provider ni tools y con reloj fijo, así el reporte es reproducible e `inconclusive` por diseño: se muestran hechos validados del baseline, anomalías, limitaciones, warnings y cobertura, y se explica que el modelo no está configurado en la demo. No se usan respuestas guionadas para no presentarlas como salida de un modelo. El grafo reutiliza `buildGraphView` + `renderGraphBody`. El índice muestra propósito, lo que la demo no hace, política de privacidad (sin cookies, analítica, formularios ni llamadas de red; datos sintéticos; no identifica personas; no es auditoría) y el estado de gates con enlace al dashboard.

**Gates.** `buildDemo` ejecuta `runEvaluation` (inyectable en tests). Si `release_blocked`, termina con `RELEASE_BLOCKED` sin escribir nada. El resultado de evaluación se publica como `evaluation.html` y su `result_id` entra en el manifest.

**Auditoría del sitio.** Antes de escribir, `auditSite` revisa cada página: CSP meta con `default-src 'none'`; sin `<script`, `<form`, `<input`, `<iframe`, `<object`, `<embed`, `<link`, `<meta http-equiv="refresh"`, atributos `on*=`, `src=`, ni URLs `http(s):`, `javascript:`, `data:` o `//`; cada `href` es `#edge-<16 hex>` presente en la misma página o una ruta relativa `.html` que existe en el sitio. Cualquier fallo termina con `UNSAFE_OUTPUT` y la lista de problemas.

**Salida.** Por defecto `<proyecto>/dist-demo`. La ruta se rechaza (`UNSAFE_OUTPUT_DIR`) si es la raíz del proyecto, la contiene o está dentro de `fixtures`, `corpus`, `evals`, `demo`, `src`, `test` u `openspec`. Si existe y no está vacía, sólo se limpia si contiene un `manifest.json` de demo previo; si no, `OUTPUT_DIR_NOT_EMPTY`. Archivos: `index.html`, `evaluation.html`, `fixtures/<id>.html`, `manifest.json` (`demo_version`, `evaluation_result_id`, `fixtures{id: manifest_sha256}`, `files{path: sha256}`). El contenido no depende de la hora.

**Hosting.** Propuesta: hosting estático de `dist-demo/` (GitHub Pages u otro). La CSP va en meta porque Pages no permite cabeceras. No se añade workflow ni se publica: requiere autorización del usuario y, con el repositorio privado, un plan que lo permita.

## Risks / Trade-offs

- CSP por meta no cubre `frame-ancestors`; un host con cabeceras debería añadirla.
- Los fixtures son sintéticos: la demo enseña el método, no transacciones reales.
