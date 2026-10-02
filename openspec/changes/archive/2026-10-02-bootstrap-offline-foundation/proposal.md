## Why

M0 necesita una base ejecutable y reproducible para probar datos antes de conectar RPC o modelos. El usuario autorizó avanzar con implementación el 2026-09-24; se mantienen los límites analíticos y de solo lectura.

## What Changes

- Crear paquete TypeScript estricto con build, tests nativos y CI sin red durante replay.
- Definir manifest v1 y loader de fixtures con validación de runtime, SHA-256 de bytes y aislamiento de paths.
- Incorporar tres escenarios sintéticos (éxito, revert y pending) y resumen de reproducción determinístico, sin claims de agentes.
- Incorporar contratos mínimos versionados de snapshot/procedencia, errores tipados y un CLI local.

## Capabilities

### New Capabilities

- `offline-fixture-replay`: importación segura de datos locales, integridad, manifest y reproducción verificable M0.

### Modified Capabilities

Ninguna capability canónica existe aún. Este change materializa el subconjunto M0 de read-only-chain-data y evaluation-observability del change de fundación; sus restantes requisitos siguen pendientes.

## Impact

Sólo el proyecto blockchain-transaction-intelligence. Sin RPC, MCP, modelo, RAG, normalización general ni extracción de tokens en M0. No SQLite todavía: archivos inmutables bastan para estos fixtures; almacenamiento de investigaciones se decidirá al necesitarlo. No declara completados M1–M11 ni archiva la fundación.
