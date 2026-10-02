# versioned-protocol-rag Specification

## Purpose
Responder sobre protocolos con un corpus curado, permitido y versionado, parsing y chunking reproducibles, búsqueda híbrida determinística, citas aplicables y verificables, abstención y aislamiento de contenido hostil, y evaluación versionada del retrieval.

## Requirements

### Requirement: corpus curado, permitido y versionado

El sistema SHALL ingerir únicamente fuentes allowlisted fijadas por versión o commit, con publisher, URI canónica, licencia o condiciones de acceso, parser versionado y SHA-256. Cada publicación SHALL crear un snapshot inmutable verificable sin sobrescribir versiones anteriores.

#### Scenario: una fuente cambia
- **WHEN** los bytes de una URI aprobada difieren del documento ya publicado
- **THEN** se crea otro document version y corpus snapshot, y las citas anteriores siguen resolviendo al snapshot original

#### Scenario: fuente o licencia no aprobada
- **WHEN** la ingesta recibe una URL fuera de la allowlist o sin condiciones de uso registradas
- **THEN** se rechaza antes de descargarla o incorporarla al corpus

### Requirement: parsing y chunking reproducibles

El sistema SHALL extraer texto sin ejecutar scripts ni cargar recursos remotos, conservar secciones/tablas/código y producir chunks con offsets exactos, hashes, versión de parser/chunker y página cuando aplique.

#### Scenario: PDF sin span verificable
- **WHEN** un PDF no permite reproducir página y offsets sobre texto canónico
- **THEN** no se acepta como fuente citable y la cobertura declara la exclusión

#### Scenario: manifest o artefacto adulterado
- **WHEN** un hash, ruta, dimensión o versión no coincide con el manifest
- **THEN** el loader rechaza el snapshot antes de responder consultas

### Requirement: búsqueda híbrida determinística

El sistema SHALL combinar BM25 y embeddings locales fijados mediante reciprocal-rank fusion, aplicar filtros antes del ranking final y desempatar determinísticamente por chunk_id. No SHALL descargar modelos ni consultar APIs durante búsqueda.

#### Scenario: replay del mismo snapshot
- **WHEN** se repite una consulta con idénticos inputs, snapshot, modelo e index version
- **THEN** se obtienen los mismos hits, orden, scores ordinales y spans

#### Scenario: modelo local ausente
- **WHEN** falta el modelo o no coincide su hash
- **THEN** la búsqueda responde unavailable/CORPUS_NOT_CONFIGURED sin intentar red

### Requirement: citas aplicables y verificables

Cada hit SHALL resolver a un documento del manifest y contener URI, título, versión o commit, sección o página, excerpt/span exacto, chunk_id, document hash, index version, corpus snapshot y compatibilidad `matched|generic|unknown|conflicting`.

#### Scenario: versión incompatible
- **WHEN** un hit describe una versión distinta de la solicitada
- **THEN** se etiqueta conflicting y no se presenta como soporte específico compatible

#### Scenario: identidad contractual desconocida
- **WHEN** no se conoce versión o deployment aplicable
- **THEN** sólo contenido generic puede apoyar una explicación general y la identidad específica permanece unknown

### Requirement: abstención y aislamiento de contenido hostil

El sistema SHALL tratar documentos y queries como datos no confiables. Instrucciones recuperadas no SHALL modificar permisos, tools, destinos de red, configuración ni políticas.

#### Scenario: consulta sin respuesta
- **WHEN** ningún chunk supera los criterios de relevancia y aplicabilidad
- **THEN** se devuelve `ok` con lista vacía, cobertura insuficiente y warning `NO_RELEVANT_DOCUMENTS`

#### Scenario: prompt injection en auditoría
- **WHEN** un excerpt ordena revelar secretos, ignorar políticas o ejecutar otra tool
- **THEN** el texto permanece delimitado como cita y no cambia autoridad ni ejecución

### Requirement: evaluación versionada del retrieval

El sistema SHALL mantener qrels humanos con casos positivos, negativos, sin respuesta, incompatibles e injection, y SHALL publicar métricas con denominadores para cada corpus/index version.

#### Scenario: gate de M5
- **WHEN** se evalúa el snapshot candidato
- **THEN** Recall@5 es al menos 0,85, MRR@10 al menos 0,75, todos los spans/hashes resuelven, todos los casos sin respuesta abstienen y ningún conflicto o contenido hostil amplía autoridad

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
