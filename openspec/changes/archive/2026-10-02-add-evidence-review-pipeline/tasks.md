## Especificación

- [x] 1.1 Fijar alcance M7, roles internos, estados de claim/reporte, validadores, degradación y gates.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Extender schemas de claims, hallazgos, anomalías y reviewed_report.
- [x] 2.2 Implementar Evidence Agent y validadores estructurales determinísticos.
- [x] 2.3 Implementar Reviewer, reasons versionadas y una corrección máxima de schema.
- [x] 2.4 Integrar el pipeline en el orquestador sin tools externas para Evidence/Reviewer.
- [x] 2.5 Añadir CLI de reporte, fixtures/evals de citas y unsupported claims, y guard offline.
- [x] 2.6 Refrescar Graphify y actualizar README, status y verificación.

## Entorno

- [x] 3.1 Ejecutar CI Linux remota con red aislada antes de archivar. Omitida por decisión del usuario el 2026-09-29: el run 36534722111 no se inició por facturación de la cuenta GitHub. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
