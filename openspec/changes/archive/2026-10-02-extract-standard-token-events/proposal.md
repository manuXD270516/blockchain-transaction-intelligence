## Why
M2 conserva logs pero todavía no explica los eventos de transferencia. M3 necesita decodificación determinística, acotada y trazable sin confundir evento emitido con saldo neto o conformidad de token.
## What Changes
- Decodificar layouts estándar Transfer ERC-20/721 y TransferSingle/TransferBatch ERC-1155.
- Generar transferencias event_reported con cantidades/ids exactos, evidencia y límites explícitos.
- Conservar desconocidos, ambiguos y malformados; cero transfers derivados de logs inconsistentes con revert global.
- Añadir grafo base de relaciones reportadas, CLI offline/live explícito y fixtures reproducibles.
## Capabilities
### New Capabilities
- `standard-token-event-extraction`: decodificación estándar, transferencias y evidencia M3.
### Modified Capabilities
Ninguna spec canónica archivada. Reutiliza normalización/evidencia M2 y adapters M1.
## Impact
Sin nuevos RPC ni dependencias runtime. Se añade @noble/hashes 1.8.0 sólo en desarrollo para verificar Keccak de firmas en tests. ABI arbitraria, proxy histórico y trazas siguen pendientes con capability unsupported; este change implementa extracción estándar y grafo base, no esas extensiones.
