## Especificación

- [x] 1.1 Fijar modelo de vista, estados, truncación, renderizado seguro y verificación.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Implementar `GraphView` desde extracción M3 y reporte M7.
- [x] 2.2 Implementar renderizado HTML/SVG escapado, sin scripts y con anclas de evidencia.
- [x] 2.3 Añadir CLI `graph` offline y tests de XSS, truncación, revert/unknown y event_reported.
- [x] 2.4 Refrescar Graphify y actualizar README, status y verificación.

## Entorno

- [x] 3.1 CI Linux remota. Omitida por decisión del usuario el 2026-09-29. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
