## ADDED Requirements

### Requirement: Immutable evidence and typed claims
El sistema SHALL aplicar evidence-model.md: evidencia content-addressed, padres de derivación acíclicos, locator y snapshot, y claims con clase OBSERVED, RULE-BASED o MODEL-INFERRED.

#### Scenario: Claim sin evidencia resoluble
- **WHEN** una conclusión cita un evidence_id inexistente o de otro snapshot incompatible
- **THEN** la revisión rechaza la conclusión y bloquea la aceptación del reporte hasta corregirla.

#### Scenario: Transformación derivada
- **WHEN** se calcula una fee o decodifica un evento
- **THEN** se registran inputs raw, versión de transformación, unidades y evidencia padre sin reemplazar el original.

### Requirement: No automatic intent attribution
El sistema SHALL etiquetar cada anomalía con las tres clases permitidas y SHALL NOT convertir un patrón en afirmación automática de fraud, scam o malicious behavior.

#### Scenario: Umbral excedido
- **WHEN** una transacción excede un umbral de eventos de una regla educativa
- **THEN** se reporta RULE-BASED con regla/version/umbral/ventana y límites, sin atribuir intención ni riesgo financiero probado.

#### Scenario: Consenso de agentes
- **WHEN** dos agentes coinciden en una hipótesis sin evidencia observacional adicional
- **THEN** la hipótesis sigue siendo MODEL-INFERRED y no se promociona a OBSERVED.

### Requirement: Reviewed reports with explicit limitations
El sistema SHALL ejecutar revisión estructural y semántica, publicar sólo claims soportados y producir partial/inconclusive cuando falta cobertura o subsisten defectos tras una corrección.

#### Scenario: Cita válida que no sustenta el texto
- **WHEN** el documento existe pero el fragmento no respalda la conclusión
- **THEN** el Reviewer rechaza el claim aunque el id y hash sean válidos.
