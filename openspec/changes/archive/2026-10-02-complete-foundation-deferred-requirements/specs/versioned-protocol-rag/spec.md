## ADDED Requirements

### Requirement: registro de versiones y resolución de citas

El sistema SHALL mantener un registro append-only de snapshots de corpus con linaje por `canonical_uri` y SHALL resolver una cita `(corpus_snapshot_id, chunk_id)` contra el snapshot citado verificando su integridad.

#### Scenario: documento actualizado
- **WHEN** un snapshot nuevo contiene la misma `canonical_uri` con otro `content_hash`
- **THEN** el registro añade la versión con el cambio `new_version` y la cita anterior sigue resolviendo al excerpt original del snapshot original

#### Scenario: registro existente
- **WHEN** se intenta registrar un id o ruta ya registrados
- **THEN** falla con `SNAPSHOT_ALREADY_REGISTERED` sin modificar el registro

#### Scenario: cita inexistente
- **WHEN** el snapshot o el chunk citado no existen
- **THEN** falla con `CITATION_SNAPSHOT_NOT_FOUND` o `CITATION_NOT_FOUND` sin inventar un excerpt
