## ADDED Requirements

### Requirement: Versioned curated corpus
El sistema SHALL ingerir sólo fuentes aprobadas con procedencia, licencia, hash, versión y spans reproducibles según rag-design.md; SHALL conservar snapshots usados por reportes.

#### Scenario: Actualización de documento
- **WHEN** cambia el contenido de una URI ya indexada
- **THEN** se crea otra versión y las citas anteriores siguen resolviendo al snapshot original.

### Requirement: Applicable citations and abstention
search_protocol_docs SHALL devolver referencias verificables y compatibilidad; los agentes SHALL abstenerse de afirmaciones documentales no respaldadas.

#### Scenario: Versión incompatible
- **WHEN** el único hit describe otra versión del contrato
- **THEN** se declara incompatibilidad y no se usa para afirmar semántica específica del caso.

#### Scenario: Consulta sin respuesta
- **WHEN** no hay documentos relevantes recuperados
- **THEN** se devuelve lista vacía con cobertura insuficiente y no se fabrica una cita.

#### Scenario: Instrucción maliciosa en auditoría
- **WHEN** un chunk solicita revelar secretos o cambiar herramientas
- **THEN** se trata como datos no confiables y no modifica permisos, destinos de red ni políticas.
