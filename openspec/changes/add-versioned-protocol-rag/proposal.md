## Why

M4 expone `search_protocol_docs`, pero se abstiene porque todavía no existe un corpus verificable. M5 debe aportar recuperación documental reproducible sin convertir navegación web, similitud vectorial o documentos hostiles en autoridad.

## What Changes

- Añadir un pipeline administrativo de ingesta para fuentes allowlisted, fijadas por commit/tag, con licencia o condiciones de acceso, procedencia, hashes y snapshots inmutables.
- Crear un corpus inicial pequeño con EIP-20/721/1155, OpenZeppelin Contracts v4.9.4 y v5.0.2 como versiones incompatibles, y la auditoría v5.0.0/commit `b5a3e69` con alcance y condiciones registrados.
- Implementar chunking reproducible e índice híbrido BM25 + embeddings locales `sentence-transformers/all-MiniLM-L6-v2`, fusionado mediante reciprocal-rank fusion.
- Activar `search_protocol_docs` sobre artefactos locales validados, con filtros de versión/protocolo, spans exactos, compatibilidad, cobertura y abstención.
- Añadir qrels y evaluaciones de retrieval, incompatibilidad, citas, consultas sin respuesta y prompt injection.

## Capabilities

### New Capabilities

- `versioned-protocol-rag`: corpus curado versionado, recuperación híbrida, citas verificables y abstención M5.

### Modified Capabilities

- `readonly-mcp-server`: `search_protocol_docs` pasa de capacidad diferida a lectura local del corpus aprobado; las otras ocho tools y la autoridad read-only no cambian.

## Impact

Se añadirán artefactos de corpus/índice, una CLI administrativa explícita y dependencias fijadas para parsing, BM25 y embeddings locales. La adquisición de fuentes puede usar red sólo durante una operación de ingesta allowlisted; carga, búsqueda, tests y MCP permanecen offline. No se añaden browsing abierto, URLs de usuario, uploads, agentes, claims, escritura on-chain ni persistencia de investigaciones.
