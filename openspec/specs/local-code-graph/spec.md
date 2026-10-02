# local-code-graph Specification

## Purpose
Provide a local code graph (Graphify) as navigation context for development, installed and activated locally and reporting its activation status honestly.

## Requirements

### Requirement: Local graph tooling
El proyecto SHALL disponer de Graphify aislado, índice AST code-only y consultas verificadas sin API de modelo.
#### Scenario: Consulta local
- **WHEN** se consulta normalizeInvestigation en el grafo
- **THEN** se obtienen nodos/rutas del código del proyecto y se registra la versión del índice.

### Requirement: Honest activation status
La documentación SHALL distinguir CLI operativo, MCP verificado y disponibilidad nativa en el host.
#### Scenario: Host no recargado
- **WHEN** MCP está configurado pero no aparece como tool en la sesión
- **THEN** se declara esa limitación y se utiliza CLI sin afirmar activación nativa.
