## ADDED Requirements

### Requirement: continuación interna hacia revisión

El orquestador SHALL continuar un run M6 hacia Evidence Agent y Reviewer internos sin ampliar allowlists de analistas ni conceder tools a esos roles. SHALL conservar el deadline de 90 s, 24 tool calls, 20.000/4.000 tokens y una corrección global única, y SHALL permitir como máximo 2 llamadas de modelo a Evidence Agent y 2 a Reviewer dentro de ese presupuesto.

#### Scenario: Reviewer necesita evidencia adicional
- **WHEN** Reviewer declara un faltante
- **THEN** solicita al orquestador reutilizar artefactos del mismo run y no llama MCP, red ni filesystem

#### Scenario: Evidence o Reviewer solicita tools
- **WHEN** una respuesta de Evidence Agent o Reviewer incluye tool_requests
- **THEN** se rechaza como POLICY_DENIED y no se ejecuta backend

#### Scenario: presupuesto compartido agotado
- **WHEN** Evidence Agent o Reviewer necesitarían una llamada de modelo o tiempo que ya no cabe en el presupuesto restante
- **THEN** no se ejecuta, se conserva el baseline validado y el reporte termina partial o inconclusive con `BUDGET_EXCEEDED`
