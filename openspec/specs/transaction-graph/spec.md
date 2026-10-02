# transaction-graph Specification

## Purpose
Represent a transaction as an evidence-backed graph and render it safely, with every node and edge inspectable down to its evidence.

## Requirements

### Requirement: Evidence-backed graph
El sistema SHALL construir nodos y aristas tipados con identidad chain-qualified, evidence_ids, orden parcial y estado executed/reverted/unknown; SHALL distinguir relaciones de llamadas, logs y transferencias event_reported.

#### Scenario: Ausencia de trazas
- **WHEN** sólo existen transacción y logs
- **THEN** el grafo muestra relaciones observables y no inventa aristas de llamadas internas ni orden causal completo.

#### Scenario: Proxy con delegatecall
- **WHEN** una traza distingue dirección de contexto y de código
- **THEN** el grafo conserva ambas y no presenta delegatecall.value como nueva transferencia nativa independiente.

### Requirement: Safe and inspectable visualization
La visualización SHALL enlazar cada arista a su evidencia y mostrar truncación, incertidumbre y reverts, escapando contenido no confiable.

#### Scenario: Grafo incompleto
- **WHEN** los datos o el límite visual omiten relaciones
- **THEN** se muestra el alcance y la omisión sin afirmar que no existan otras interacciones.

#### Scenario: Símbolo con HTML
- **WHEN** un token contiene markup o scripts en su nombre
- **THEN** se representa como texto inerte sin ejecutar código ni cargar recursos externos.
