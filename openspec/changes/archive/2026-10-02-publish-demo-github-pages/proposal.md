## Why

M11 dejó el sitio estático listo pero prohibió publicarlo hasta tener autorización explícita y un host compatible (`prepare-public-demo` 3.2). El 2026-10-02 el usuario autorizó publicar con GitHub Pages y el repositorio es público, así que Pages está disponible sin plan de pago. Publicar a mano rompería la trazabilidad: hace falta un camino único, automatizado y con gates hacia `published: true`.

## What Changes

- Añadir un workflow `Publish demo` con acciones fijadas por SHA, que publica en GitHub Pages sólo si pasan todos los pasos previos:
  1. Instalación reproducible, typecheck, build y tests en un namespace sin red.
  2. Runner de evaluación sin `release_blocked`.
  3. Build del sitio con sus propias gates y verificación del directorio de salida en disco.
- Añadir `demo-cli verify <dir>`, que relee el sitio construido y comprueba:
  - que los hashes coinciden con `manifest.json`;
  - que no hay archivos extra;
  - que la auditoría de contenido activo pasa sobre los bytes en disco.
- Añadir un script de verificación post-despliegue que descarga cada página publicada y comprueba:
  - que su SHA-256 coincide con el manifest;
  - la CSP estricta, el content-type y la ausencia de secretos.

  Sólo entonces emite el registro `published: true`. Es la única ruta que lo produce.
- Habilitar Pages con `build_type=workflow` y documentar la URL pública.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `public-demo`: la build sigue sin desplegar por sí misma, pero un workflow con gates puede publicar el artefacto verificado. `published: true` sólo se emite tras verificar el sitio en vivo.

## Impact

Se añaden `.github/workflows/pages.yml`, `scripts/verify-pages.mjs`, el subcomando `verify` y tests. No hay dependencias nuevas ni servidor. El sitio sigue sin JavaScript, formularios, cookies, wallet ni consultas live. GitHub Pages no permite cabeceras propias: la CSP sigue en `<meta>` y `frame-ancestors` no aplica (riesgo ya documentado en M11).
