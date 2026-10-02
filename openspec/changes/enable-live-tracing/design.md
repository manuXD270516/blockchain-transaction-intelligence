# Diseño — Habilitar tracing live

Prerrequisito ya implementado: `src/adapters/tracing.ts`, `config/live-tracing.example.json` y los tests con transporte simulado.

Decisiones pendientes del usuario:

1. **Proveedor.** Debe ofrecer Sepolia y `debug_traceTransaction` con `callTracer`, y publicar límites, retención de datos y coste.
2. **Credencial.** Se leerá de una variable de entorno con nombre fijo, sólo en el proceso administrativo. Nunca en URL versionada, logs ni reportes. La redacción M10 debe probarse con su formato.
3. **Allowlist.** El host del proveedor se añade a la configuración local, no al código, y mantiene HTTPS, IPv4 pública y sin redirects.

Límites: timeout de 20 s por traza, 2 MiB, 1000 frames y profundidad 64, como en `call-trace/1.0.0`.

Verificación prevista:

- smoke live de una transacción Sepolia conocida;
- comparación del frame raíz con transaction y receipt;
- registro de run id y fecha en `docs/verification.md`.
