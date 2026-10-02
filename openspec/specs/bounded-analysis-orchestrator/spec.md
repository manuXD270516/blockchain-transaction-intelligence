# bounded-analysis-orchestrator Specification

## Purpose
Orquestar el análisis de una transacción con un baseline determinístico primero y analistas con tools acotadas por rol, presupuestos globales y un proveedor de modelo inyectable sin autoridad directa, produciendo un draft trazable de claims tipados con evidencia resoluble que pasa a revisión.

## Requirements

### Requirement: baseline determinístico con claims tipados

El sistema SHALL construir primero un baseline desde evidencia M2/M3 y SHALL emitir únicamente claims OBSERVED o RULE-BASED content-addressed, con clase, incertidumbre, limitaciones y evidence ids resolubles.

#### Scenario: proveedor de modelo ausente
- **WHEN** no hay provider configurado
- **THEN** se entrega el baseline como inconclusive, se declara `MODEL_PROVIDER_NOT_CONFIGURED` y no se intenta red

#### Scenario: receipt ausente
- **WHEN** la transacción está incluida pero el receipt no está disponible
- **THEN** el baseline conserva ejecución unknown, no afirma revert ni ausencia de eventos y declara cobertura parcial

### Requirement: analistas con tools por rol

El sistema SHALL ejecutar Transaction Analyst y Contract Analyst únicamente mediante las allowlists definidas, y SHALL validar tool/argumentos antes de cualquier backend.

#### Scenario: Transaction Analyst solicita búsqueda documental
- **WHEN** Transaction Analyst solicita `search_protocol_docs`
- **THEN** el orquestador rechaza `POLICY_DENIED` sin ejecutar la tool

#### Scenario: balance no solicitado
- **WHEN** Transaction Analyst solicita `get_wallet_balance` sin que el input declare esa necesidad y un bloque fijado
- **THEN** se rechaza antes del backend y se registra la denegación segura

#### Scenario: contrato desconocido
- **WHEN** Contract Analyst carece de ABI, identidad y documentación compatible
- **THEN** mantiene identidad unknown y cualquier explicación documental se limita a contexto generic

### Requirement: provider inyectable sin autoridad directa

El sistema SHALL encapsular modelos detrás de un provider versionado que recibe datos delimitados y devuelve JSON conforme a schema, sin acceso directo a MCP, red, filesystem ni secretos.

#### Scenario: instrucción hostil en log o documento
- **WHEN** contexto no confiable solicita cambiar permisos, revelar secretos o enviar una transacción
- **THEN** no cambia tool policy ni configuración y el texto sólo permanece como dato citado

#### Scenario: claim producido por modelo
- **WHEN** un analista propone una interpretación aunque coincida con otro rol
- **THEN** la clasificación permanece MODEL-INFERRED y review_status permanece proposed

### Requirement: presupuestos globales y corrección acotada

El orquestador SHALL aplicar por run deadline de 90 s, máximo 24 tool calls, 20.000 tokens de entrada, 4.000 de salida, dos analistas, dos tools concurrentes y una sola corrección de schema.

#### Scenario: presupuesto agotado
- **WHEN** una solicitud excede cualquier presupuesto restante
- **THEN** no se ejecuta, el draft termina partial/inconclusive y conserva baseline con `BUDGET_EXCEEDED`

#### Scenario: schema inválido persistente
- **WHEN** la respuesta sigue inválida tras una corrección
- **THEN** se descarta, no se inicia otro ciclo y el draft declara `MODEL_OUTPUT_REJECTED`

### Requirement: validación de evidencia, snapshots y lenguaje

El sistema SHALL rechazar claims con evidence ids ausentes, snapshots incompatibles, ciclos, clases no autorizadas o atribuciones automáticas de fraude, scam, conducta maliciosa, identidad humana o causa no observada.

#### Scenario: cita de otro run
- **WHEN** un claim referencia evidencia válida pero ajena al manifest actual
- **THEN** se rechaza y no aparece entre claims publicados del draft

#### Scenario: atribución automática de intención
- **WHEN** un output llama fraudulenta o maliciosa a una entidad basándose sólo en patrones/eventos
- **THEN** se rechaza aunque tenga evidence ids válidos

### Requirement: draft trazable y no revisado

El sistema SHALL devolver `analysis_draft` con manifest de input/snapshot/corpus/provider/prompts/policy/budgets/tools, claims validados, rechazos, cobertura, warnings y estado complete|partial|inconclusive. SHALL NOT etiquetarlo reviewed ni accepted en M6.

#### Scenario: análisis estructural exitoso
- **WHEN** baseline y analistas completan sin defectos estructurales
- **THEN** el draft puede ser complete pero declara `REVIEW_NOT_RUN` y todos los claims permanecen proposed

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
