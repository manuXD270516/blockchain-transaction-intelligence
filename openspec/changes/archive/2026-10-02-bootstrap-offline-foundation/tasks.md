## 1. Contratos previos
- [x] 1.1 Especificar manifest, límites, estados y replay de offline-fixture-replay.
- [x] 1.2 Validar el change con OpenSpec estricto antes de implementación.

## 2. Implementación M0
- [x] 2.1 Crear paquete TypeScript estricto y scripts build/test/check.
- [x] 2.2 Implementar validadores, loader seguro e integridad SHA-256.
- [x] 2.3 Implementar resumen determinístico y CLI local.
- [x] 2.4 Añadir fixtures synthetic de success/reverted/pending y oráculos privados en tests.
- [x] 2.5 Añadir pruebas de corrupción, paths, límites, schemas y snapshots; ejecutar con guard offline local.
- [x] 2.6 Añadir CI y documentación reproducible; registrar estado M0 separado de M1–M11.

## 3. Verificación de entorno pendiente
- [x] 3.1 Ejecutar workflow Linux con red aislada y prueba de symlink de archivo; no archivar hasta registrar resultado. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
