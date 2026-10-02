## Why

M6 produce un `analysis_draft` con claims proposed, pero todavía no valida referencias, no revisa soporte semántico y no publica un reporte. M7 debe convertir ese draft en revisión estructurada sin conceder tools externas ni aceptar conclusiones sobre evidencia incompleta.

## What Changes

- Añadir Evidence Agent como validador interno: evidencia resoluble, snapshots, spans, transformaciones, DAG acíclico, clases coherentes y cobertura.
- Añadir Reviewer como validador interno: contrastar cada claim con su evidencia, rechazar alcance excesivo, lenguaje prohibido y citas que no sustentan el texto.
- Ejecutar validadores estructurales aunque el modelo apruebe; una id válida no implica soporte semántico.
- Publicar un `reviewed_report` versionado con claims `supported|rejected|needs_revision`, anomalías no atribuidas a fraude, limitaciones y replay manifest.
- Permitir como máximo una corrección estructural de schema; defectos persistentes producen `inconclusive` con hechos validados.
- Reutilizar el provider inyectable de M6; sin proveedor remoto habilitado, secretos, persistencia, UI, tracing ni operaciones mutantes.

## Capabilities

### New Capabilities

- `evidence-review-pipeline`: Evidence Agent, Reviewer, validadores estructurales y reporte revisado M7.

### Modified Capabilities

- `bounded-analysis-orchestrator`: el orquestador continúa el run con Evidence/Reviewer internos después del draft M6; no cambia allowlists de analistas ni habilita tools para esos roles.

## Impact

Se añaden tipos de revisión, validadores, pipeline, CLI de reporte, fixtures scripted y evals de citas/unsupported claims. No se añaden herramientas MCP para Evidence/Reviewer, proveedores remotos, almacenamiento de investigaciones, frontend ni envío on-chain.
