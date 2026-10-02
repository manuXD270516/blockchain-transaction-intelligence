# evaluation-observability Specification

## Purpose
Evaluate the system reproducibly over verified fixtures, with complete metrics, explicit denominators and release gates, plus correlated, privacy-aware telemetry.

## Requirements

### Requirement: Reproducible fixture evaluation
El sistema SHALL conservar manifests, hashes, golden privados al agente, splits y versiones según evaluation-strategy.md y ejecutar regresión offline separada de pruebas live.

#### Scenario: Fixture modificado
- **WHEN** un payload no coincide con el checksum de su manifest
- **THEN** el runner rechaza el caso como inválido y no lo contabiliza como éxito.

### Requirement: Complete metrics and release gates
El sistema SHALL medir reconstrucción, extracción, contratos, selección de tools, citas, retrieval, unsupported claims, anomalías, latencia, tokens y cobertura con denominadores explícitos y gates documentados.

#### Scenario: No hay casos aplicables
- **WHEN** una métrica tiene denominador cero o falta usage del proveedor
- **THEN** se reporta N/A o unavailable, sin sustituirlo por éxito o cero tokens.

#### Scenario: Violación de política
- **WHEN** aparece una tool mutante, cita fabricada o acusación automática de intención
- **THEN** el gate de seguridad bloquea release aunque las métricas promedio sean altas.

### Requirement: Correlated and privacy-aware telemetry
El sistema SHALL correlacionar run/tools/retrieval/review, registrar budgets y versiones, redactar secretos y cumplir retención declarada en threat-model.md antes de la demo pública.

#### Scenario: Error con credencial
- **WHEN** un proveedor incluye un endpoint con token o header secreto en el error
- **THEN** la telemetría y el reporte conservan el código y contexto útil con las credenciales redactadas.

#### Scenario: Retención expirada
- **WHEN** vence el plazo de un run efímero de demo
- **THEN** se eliminan los datos propios del run y sus referencias privadas sin eliminar fixtures públicos compartidos.
