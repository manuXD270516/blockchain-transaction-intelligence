## 1. Especificación
- [x] 1.1 Definir contrato canónico, evidencia, fees y límites antes de implementar.
- [x] 1.2 Validar change estricto.

## 2. Implementación y verificación
- [x] 2.1 Implementar validadores y modelo canónico exacto.
- [x] 2.2 Implementar evidencia content-addressed y derivaciones verificadas.
- [x] 2.3 Implementar fees conservadoras y estados/cobertura.
- [x] 2.4 Integrar CLI fixture/live y preservar offline por defecto.
- [x] 2.5 Ejecutar golden y pruebas de integridad/consistencia/precisión.
- [x] 2.6 Actualizar README, inventario y resultados de verificación.

## 3. Entorno
- [x] 3.1 Ejecutar CI Linux remoto y registrar resultado antes de archivar. **Cumplida 2026-10-02:** run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154) de GitHub Actions (`ubuntu-latest`) sobre `ea1effc`: typecheck, build y 184/184 tests bajo `sudo unshare --net` (incluida la prueba de symlink de archivo) y regeneración de fixtures sin diff.
