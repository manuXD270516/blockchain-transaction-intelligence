## Why

M1–M5 entregan adquisición, normalización, eventos, MCP y documentación, pero todavía no existe una ejecución acotada que convierta esos artefactos en un borrador de análisis con claims tipados. M6 debe introducir Transaction Analyst y Contract Analyst sin adelantar la revisión/aceptación de M7 ni conceder autoridad directa a un modelo.

## What Changes

- Añadir un baseline determinístico que produce claims OBSERVED/RULE-BASED desde bundles M2/M3 y conserva evidencia resoluble.
- Implementar Transaction Analyst y Contract Analyst detrás de un proveedor de modelo inyectable, con schemas cerrados, prompts/versiones y temperatura/configuración registradas.
- Añadir un orquestador que aplica allowlists por rol, snapshot único, máximo 24 tool calls, 20.000 tokens de entrada, 4.000 de salida, deadline de 90 s y una única corrección de schema.
- Validar estructura, clases, evidence ids, snapshots, lenguaje prohibido y cobertura antes de emitir un `analysis_draft`.
- Entregar baseline `partial/inconclusive` cuando el proveedor no está configurado, agota presupuesto o devuelve contenido inválido.
- Añadir CLI y escenarios offline con proveedor scripted; ningún proveedor remoto queda habilitado por defecto.

## Capabilities

### New Capabilities

- `bounded-analysis-orchestrator`: baseline, roles analistas, tool policy, budgets y draft estructurado M6.

### Modified Capabilities

Ninguna capability runtime existente cambia de autoridad. M6 consume APIs M2–M5; Evidence Agent, Reviewer y reportes accepted permanecen diferidos a M7.

## Impact

Se añaden tipos/validadores de claims, provider interface, orquestador, CLI offline, fixtures de respuestas y evals de selección de tools/unsupported claims. No se añaden SDKs remotos, claves, endpoints configurables, persistencia, tracing, firma ni operaciones on-chain mutantes.
