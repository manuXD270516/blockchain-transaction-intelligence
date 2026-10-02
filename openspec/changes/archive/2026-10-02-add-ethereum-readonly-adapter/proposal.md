## Why

M0 permite replay sintético. M1 necesita adquirir datos de una testnet sin ampliar permisos hacia firma ni ejecución, y detectar respuestas inconsistentes antes de normalizarlas.

## What Changes

- Añadir interfaz de investigación con adapters fixture y Ethereum Sepolia, CLI live explícito y proveedor público administrado.
- Implementar lecturas de transaction, receipt, block, balance nativo, código y logs de un bloque; snapshots y procedencia raw.
- Aplicar allowlist RPC, validación de entradas/respuestas, límites, deadline, dos intentos máximos y errores redactados.
- Cubrir mismatch de chain, reorg, pending/not-found, datos pruned, proveedor no compatible y fallos transitorios mediante transporte simulado reproducible.
- Corregir documentación de M0 y publicar inventario completo con estados reales.

## Capabilities

### New Capabilities

- `ethereum-readonly-adapter`: adquisición acotada de datos testnet y adapter offline intercambiable.

### Modified Capabilities

Ninguna spec canónica publicada todavía. Concreta M1 del diseño de fundación; MCP, decodificación, RAG y agentes siguen pendientes.

## Impact

Sin dependencias de runtime nuevas. Replay existente permanece offline. Live requiere comando explícito; nunca ejecuta transacciones ni necesita fondos. Verificación live es distinta de tests simulados y se documentará si no está disponible.
