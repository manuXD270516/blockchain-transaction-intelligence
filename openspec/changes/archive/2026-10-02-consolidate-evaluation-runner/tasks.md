## Especificación

- [x] 1.1 Fijar golden, suites, métricas, gates, comparación y límites.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Escribir golden versionado desde el generador de fixtures.
- [x] 2.2 Implementar suites en proceso y sub-evals con métricas y denominadores.
- [x] 2.3 Implementar gates, release_blocked, comparación pareada y dashboard.
- [x] 2.4 Añadir CLI `eval` y tests de fixture adulterado, N/A, violación de política y comparación.
- [x] 2.5 Refrescar Graphify y actualizar README, status y verificación.

## Entorno

- [x] 3.1 CI Linux remota. Omitida por decisión del usuario el 2026-09-29. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
