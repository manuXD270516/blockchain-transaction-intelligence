## Especificación

- [x] 1.1 Fijar formato callTracer, modelo de frame, coherencia, límites, fixtures e integración.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Implementar loader de fixtures de traza con checksums y generación determinística.
- [x] 2.2 Implementar normalizador de trazas con revert propio/ancestral, delegatecall, límites y evidencia.
- [x] 2.3 Integrar trazas opcionales en grafo M8 y `trace_transaction` con backend opcional.
- [x] 2.4 Añadir CLI `calltrace`, flag `--with-trace` y tests offline.
- [x] 2.5 Refrescar Graphify y actualizar README, status y verificación.

## Entorno

- [x] 3.1 CI Linux remota. No ejecutada: GitHub Actions bloqueado por facturación; sólo evidencia local en contenedor Linux. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
