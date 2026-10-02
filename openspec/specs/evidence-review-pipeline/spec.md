# evidence-review-pipeline Specification

## Purpose
Revisar los claims del draft con un Evidence Agent interno y un Reviewer de entailment, con validadores estructurales independientes del modelo y anomalías tipadas sin atribución automática, y producir un reporte revisado no persistente.

## Requirements

### Requirement: Evidence Agent interno y sin tools externas

El sistema SHALL validar evidencia, locators, hashes, parents, snapshots, spans y clases de claims sin conceder tools MCP, red, filesystem ni secretos a Evidence Agent.

#### Scenario: cita de otro run
- **WHEN** un claim referencia un evidence_id inexistente o de un snapshot incompatible
- **THEN** Evidence Agent lo rechaza, no se publica como supported y el reporte no puede ser accepted

#### Scenario: solicitud de evidencia faltante
- **WHEN** Evidence Agent detecta un locator o parent ausente
- **THEN** emite una solicitud estructurada al orquestador y no ejecuta tools por sí mismo

### Requirement: Reviewer con entailment y límites de alcance

El sistema SHALL contrastar cada claim publicado con su evidencia y SHALL rechazar texto no sustentado, alcance excesivo, documentación incompatible y atribuciones de intención.

#### Scenario: cita válida que no sustenta el texto
- **WHEN** el documento o log existe pero el fragmento no respalda la conclusión
- **THEN** el Reviewer marca rejected o needs_revision y el claim no aparece como conclusión

#### Scenario: consenso de analistas
- **WHEN** Transaction Analyst y Contract Analyst coinciden en una hipótesis MODEL-INFERRED
- **THEN** la clase permanece MODEL-INFERRED y no se promociona a OBSERVED

#### Scenario: evento reportado elevado a ownership
- **WHEN** un claim afirma saldo neto, propiedad o conformidad sólo a partir de un Transfer event_reported
- **THEN** se rechaza aunque los evidence ids sean válidos

### Requirement: validadores estructurales independientes del modelo

El sistema SHALL ejecutar validadores determinísticos de ids, DAG, clases, snapshots, lenguaje prohibido y cobertura aunque el modelo apruebe.

#### Scenario: Reviewer aprueba un claim estructuralmente inválido
- **WHEN** el modelo marca supported un claim con evidence_id irresoluble o clase incoherente
- **THEN** el validador lo rechaza y bloquea accepted

#### Scenario: atribución automática de fraude
- **WHEN** un output llama fraud, scam o malicious a una entidad
- **THEN** se rechaza y no aparece como anomalía ni conclusión

### Requirement: anomalías tipadas sin atribución automática

El sistema SHALL publicar anomalías sólo como referencias a claims existentes con clase OBSERVED, RULE-BASED o MODEL-INFERRED, y SHALL NOT convertir un patrón, umbral o consenso en fraude, scam, intención o daño.

#### Scenario: umbral educativo
- **WHEN** una regla versionada marca un conteo sobre un umbral
- **THEN** se publica RULE-BASED con regla, versión, ventana y límites, sin afirmar riesgo financiero ni conducta maliciosa

#### Scenario: sin baseline estadístico
- **WHEN** no hay población ni ventana declaradas
- **THEN** no se usa “inusual para esta wallet” ni una probabilidad numérica de fraude

### Requirement: reporte revisado y no persistente

El sistema SHALL publicar un `reviewed_report` versionado con modo `synthetic|testnet_live`, resumen, timeline de orden parcial, entidades, eventos, transferencias event_reported, tabla claim→evidence, documentación citada, anomalías, limitaciones, cobertura, budgets, replay manifest y warning `REVIEW_IS_NOT_A_SECURITY_AUDIT`. SHALL NOT persistir investigaciones. SHALL restringir el estado del reporte a `accepted|partial|inconclusive`.

#### Scenario: todos los claims sustantivos supported
- **WHEN** baseline y claims inferidos acotados pasan Evidence, Reviewer y validadores
- **THEN** el reporte puede ser accepted y declara que no es una auditoría de seguridad

#### Scenario: defectos tras una corrección
- **WHEN** persisten claims no soportados después de la única corrección permitida
- **THEN** el reporte es inconclusive, conserva hechos validados y registra rechazos con motivo

#### Scenario: provider ausente
- **WHEN** no hay ModelProvider configurado
- **THEN** se publica un reporte sobre el baseline estructuralmente válido, MODEL-INFERRED no se aceptan y el estado es inconclusive
