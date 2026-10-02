## Especificación

- [x] 1.1 Fijar host, workflow con gates, verificación en disco y en vivo.
- [x] 1.2 Validar OpenSpec estricto antes de código.

## Implementación

- [x] 2.1 Implementar `demo-cli verify` y tests.
- [x] 2.2 Implementar `scripts/verify-pages.mjs` y test con servidor local.
- [x] 2.3 Añadir workflow `Publish demo` con acciones fijadas por SHA.
- [x] 2.4 Habilitar Pages (`build_type=workflow`) y ejecutar el despliegue. **Hecha 2026-10-02:** Pages habilitado con `build_type=workflow` tras la autorización del usuario; deploy en el run [36986271044](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36986271044) sobre `71ffd0f`.
- [x] 2.5 Verificar la URL en vivo y registrar run id, URL y cabeceras en README, status y verificación. **Hecha 2026-10-02:** el job `verify-live` del run [36986271044](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36986271044) verificó https://manuxd270516.github.io/blockchain-transaction-intelligence/ (6 archivos idénticos al manifiesto, CSP por `<meta>`) y emitió `published: true`. Pages no permite cabeceras propias: HSTS, nosniff, CSP, referrer-policy y frame-options llegan vacías en la respuesta y quedan registradas así.
