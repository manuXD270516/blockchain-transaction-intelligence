## ADDED Requirements

### Requirement: Role-scoped orchestration
El sistema SHALL implementar Transaction Analyst, Contract Analyst, Evidence Agent y Reviewer con permisos y responsabilidades de agent-boundaries.md y salida de claims estructurada.

#### Scenario: Reviewer solicita acceso externo
- **WHEN** el Reviewer necesita evidencia adicional
- **THEN** emite una solicitud al orquestador, sin ejecutar herramientas externas ni ampliar su rol.

#### Scenario: Nombre de contrato no acreditado
- **WHEN** Contract Analyst carece de ABI/procedencia/identidad compatibles con el bloque
- **THEN** mantiene identidad desconocida y sólo ofrece contexto genérico claramente delimitado.

### Requirement: Global budget and bounded correction
El orquestador SHALL aplicar el deadline y presupuestos globales de mcp-contract.md y permitir como máximo una vuelta de corrección.

#### Scenario: Agotamiento del presupuesto
- **WHEN** se alcanza el límite de tokens, tools, intentos o tiempo
- **THEN** termina el trabajo adicional y entrega evidencia validada como partial/inconclusive con el motivo.

#### Scenario: Defecto persistente
- **WHEN** tras la corrección siguen existiendo claims no soportados
- **THEN** no se aceptan ni se inicia un ciclo de agentes indefinido.
