# evidence-graph-view Specification

## Purpose
Mostrar un grafo de la transacción en el que cada nodo y arista está respaldado por evidencia, con render seguro, inspección de la evidencia y alcance y truncación visibles.

## Requirements

### Requirement: modelo de grafo respaldado por evidencia

El sistema SHALL construir una vista con nodos chain-qualified y aristas tipadas `transaction_declared|emits|inconsistent_log_reported|token_transfer_reported`, cada una con estado `executed|reverted|unknown`, orden parcial y evidence_ids resolubles en el DAG M2/M3. SHALL NOT crear aristas de llamadas internas sin trazas.

#### Scenario: ausencia de trazas
- **WHEN** sólo existen transacción, receipt y logs
- **THEN** la vista muestra relaciones observables, declara `call_trace_available=false` y no inventa llamadas internas ni orden causal completo

#### Scenario: receipt revertido
- **WHEN** el receipt reporta status reverted
- **THEN** la arista `transaction_declared` tiene estado reverted y los logs presentes se muestran como `inconsistent_log_reported`

#### Scenario: receipt ausente
- **WHEN** la transacción está pending o sin receipt
- **THEN** las aristas tienen estado unknown y la vista no afirma éxito ni fallo

### Requirement: visualización segura e inspeccionable

El sistema SHALL renderizar HTML autocontenido sin scripts ni recursos externos, SHALL escapar todo contenido no confiable y SHALL enlazar cada arista a su panel de evidencia.

#### Scenario: etiqueta con HTML
- **WHEN** un texto de nodo o arista contiene markup, scripts o atributos de evento
- **THEN** se representa como texto inerte sin ejecutar código ni cargar recursos

#### Scenario: cada arista abre evidencia
- **WHEN** se inspecciona una arista
- **THEN** su enlace interno lleva a un panel con evidence_ids, kinds y claims del reporte que la citan

### Requirement: alcance y truncación visibles

El sistema SHALL mostrar total, mostradas y omitidas cuando se supera el límite de 200 aristas y SHALL declarar que la omisión no prueba ausencia de otras interacciones.

#### Scenario: grafo mayor que el límite
- **WHEN** hay más de 200 aristas
- **THEN** se muestran las primeras 200 por orden parcial y un aviso con total y omitidas
