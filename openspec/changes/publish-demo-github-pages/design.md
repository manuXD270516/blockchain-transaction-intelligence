# Diseño — Publicación de la demo en GitHub Pages

## Host

GitHub Pages del repositorio público `manuXD270516/blockchain-transaction-intelligence`, con `build_type=workflow`. URL: https://manuxd270516.github.io/blockchain-transaction-intelligence/. No hay dominio propio, analítica ni cookies. Pages sirve HTTPS y no admite cabeceras personalizadas, así que la CSP va en `<meta>` como en M11.

## Workflow `Publish demo`

Se dispara con `push` a `master` y `workflow_dispatch`. `concurrency: pages`, sin cancelar un despliegue en curso. Las acciones se fijan por SHA de commit con el tag en comentario.

1. Job `build` (`contents: read`):
   1. `npm ci --ignore-scripts`, typecheck y build.
   2. Tests bajo `sudo unshare --net`.
   3. `node dist/eval-cli.js run --repetitions 5`, que sale con código 1 si `release_blocked`; el JSON se conserva.
   4. `node dist/demo-cli.js build --out dist-demo`, que también se niega si release está bloqueado.
   5. `node dist/demo-cli.js verify dist-demo`.
   6. Sube el artefacto de Pages y el `manifest.json` como artefacto aparte.
2. Job `deploy` (`pages: write`, `id-token: write`, entorno `github-pages`): `actions/deploy-pages`, sólo si `build` pasa.
3. Job `verify-live` (`contents: read`):
   1. Descarga el manifest y ejecuta `scripts/verify-pages.mjs <page_url> manifest.json` contra la URL desplegada.
   2. Emite `{"published": true, ...}` en el resumen del job.
   3. Si falla, el workflow queda en rojo y la demo no se registra como publicada.

## `demo-cli verify <dir>`

1. Lee `manifest.json` (schema 1.0.0) y lista recursivamente el directorio.
2. Rechaza archivos fuera de `files ∪ {manifest.json}`, archivos ausentes y symlinks.
3. Recalcula el SHA-256 de cada archivo y ejecuta `auditSite` sobre los bytes leídos.
4. Si algo falla, devuelve el error `UNSAFE_OUTPUT` con la lista de problemas.

Es offline y determinístico.

## Verificación en vivo

`scripts/verify-pages.mjs` sólo acepta URLs `https://<owner>.github.io/<repo>/` y sólo hace GET de las rutas del manifest. Para cada ruta comprueba:

- status 200;
- `content-type: text/html`;
- SHA-256 del cuerpo igual al manifest;
- meta CSP con `default-src 'none'`;
- ausencia de `<script`, de URLs externas y de patrones de secretos (`ghp_`, `github_pat_`, `sk-`, `AKIA`, `-----BEGIN`, `Bearer `).

Registra las cabeceras de seguridad que Pages entrega (`strict-transport-security`, `x-content-type-options` si existe) sin exigir las que Pages no permite configurar. Es una utilidad de mantenimiento con red y no forma parte de `npm test`.

## Verificación

- Tests de `verify`: sitio válido, archivo adulterado, archivo extra, archivo ausente e inyección de script tras la build.
- Test del script de verificación en vivo con un servidor HTTP local efímero y URL base inyectada por variable de entorno sólo en tests: bytes iguales y adulterados, CSP ausente y secreto presente.
- Ejecución real del workflow con el run id y la URL registrados en `docs/verification.md`.
