## Why

M1 entrega datos raw y capturas verificables, pero los consumidores todavía deben interpretar hex, nulls y snapshots por su cuenta. M2 centraliza esa transformación determinística y vincula cada objeto canónico a evidencia, sin introducir inferencias de agentes.

## What Changes

- Crear normalizador puro v1 para resultados de ChainAdapter, con transaction/receipt/block/logs canónicos.
- Convertir cantidades con BigInt a strings decimales exactos, preservar raw y tipos desconocidos.
- Verificar integridad y correspondencia de evidencia antes de normalizar; producir DAG content-addressed de fuentes y derivaciones.
- Calcular execution fee y blob fee sólo con campos suficientes; no atribuir movimientos efectivos al value declarado.
- Añadir CLI normalize offline y opción live explícita, golden fixtures y pruebas negativas.

## Capabilities

### New Capabilities

- `canonical-transaction-evidence`: representación exacta, estados separados y derivaciones reproducibles M2.

### Modified Capabilities

Ninguna spec canónica archivada todavía. Implementa M2 del diseño de fundación, sin decodificación ABI/token ni claims de M3/M7.

## Impact

No dependencias nuevas, RPC nuevo ni llamadas live implícitas. Almacenamiento de evidencia autocontenido en el bundle JSON exportable; base persistente multi-investigación y retención quedan para M7/M10. Se conserva replay M0 y adquisición M1.
