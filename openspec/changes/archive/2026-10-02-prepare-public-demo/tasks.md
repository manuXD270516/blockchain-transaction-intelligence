## Especificación

- [x] 1.1 Fijar selección curada, contenido, auditoría, salida, gates y hosting propuesto.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Añadir `demo/fixtures.json` y su validación con checksums.
- [x] 2.2 Renderizar índice, páginas de fixture y dashboard con CSP estricta.
- [x] 2.3 Implementar auditoría del sitio, salida segura, manifest y bloqueo por gates.
- [x] 2.4 Añadir CLI `demo:site`, `dist-demo/` en gitignore y tests.
- [x] 2.5 Documentar hosting propuesto sin desplegar; refrescar Graphify y actualizar README, status y verificación.

## Publicación

- [x] 3.1 CI Linux remota. Omitida por decisión del usuario el 2026-09-29. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
- [x] 3.2 Publicar el sitio. Pendiente de autorización explícita del usuario y de un host compatible. **Cumplida 2026-10-02:** autorizada por el usuario y publicada en GitHub Pages (https://manuxd270516.github.io/blockchain-transaction-intelligence/) por el workflow `Publish demo`, run [36986271044](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36986271044); ver publish-demo-github-pages.
