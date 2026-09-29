## ADDED Requirements

### Requirement: búsqueda documental local activada

`search_protocol_docs` SHALL consultar exclusivamente un corpus local aprobado y validado, mantener el input cerrado de M4 y devolver hits citables dentro del envelope MCP existente. Las otras tools y la autoridad read-only no SHALL cambiar.

#### Scenario: corpus disponible
- **WHEN** un cliente invoca `search_protocol_docs` y el snapshot local pasa integridad
- **THEN** recibe como máximo `top_k` hits ordenados con hashes, spans, compatibilidad e identidad del corpus

#### Scenario: corpus no configurado
- **WHEN** no existe un snapshot local válido
- **THEN** la tool conserva `unavailable`, datos null y warning `CORPUS_NOT_CONFIGURED`

#### Scenario: intento de browsing
- **WHEN** query, protocol o version contienen una URL o instrucciones para descargar otra fuente
- **THEN** se tratan como texto/filtros, no se realiza red y no se amplía la allowlist
