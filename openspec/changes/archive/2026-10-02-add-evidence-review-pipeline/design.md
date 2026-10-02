# Diseño M7 — Evidence, Reviewer y reporte

## Alcance y autoridad

M7 consume el `analysis_draft` de M6 y no sustituye baseline ni analistas. Evidence Agent y Reviewer no tienen tools MCP, red, filesystem ni secretos. Si falta evidencia, solicitan al orquestador un faltante estructurado; el orquestador puede reutilizar artefactos ya obtenidos del mismo run, pero no abre un segundo ciclo de analistas salvo la corrección única ya prevista.

La salida deja de ser un draft proposed. Se llama `reviewed_report`. `accepted` exige todos los claims sustantivos `supported` y cobertura suficiente. `rejected` no aparece como conclusión; queda en auditoría. `partial` cubre datos incompletos sin atribuir totalidad. Snapshot contradictorio, citas irresolubles, entailment fallido persistente o presupuesto agotado producen `inconclusive`.

## Roles internos

Evidence Agent valida:

- evidence ids resuelven en el manifest del run
- hashes, locators, parents y transformaciones coinciden
- DAG acíclico hasta raw o document_span
- snapshots on-chain y corpus no se mezclan
- OBSERVED/RULE-BASED/MODEL-INFERRED respetan su definición
- claims MODEL-INFERRED no se promocionan por consenso

Reviewer valida:

- el fragmento citado respalda el texto
- no hay alcance mayor que las premisas
- alternativas e incertidumbre están presentes cuando la clase es MODEL-INFERRED
- no hay atribución de fraude, scam, intención, control humano o causa no observada
- documentación incompatible no sustenta semántica específica
- eventos `event_reported` no se elevan a saldo, ownership o conformidad

Validadores estructurales se ejecutan siempre, incluso si Reviewer aprueba. Un hash correcto no basta.

## Pipeline

1. Recibir draft M6, investigación, bundle, extraction y journal.
2. Evidence Agent produce hallazgos estructurados y un conjunto de claims revisables.
3. Reviewer emite `supported|rejected|needs_revision` por claim, con reasons versionadas.
4. Si hay `needs_revision` estructural de schema, se permite una corrección; no hay loop.
5. Validadores determinísticos finales rechazan cualquier claim inválido aunque el modelo lo marque supported.
6. Se publica el reporte: resumen, timeline de orden parcial, entidades, eventos, transferencias event_reported, claims, evidencia, documentación, limitaciones, cobertura, budgets y replay manifest.

Evidence Agent y Reviewer usan el mismo `ModelProvider` inyectable, con prompts y policy versionados. Sin provider, M7 todavía emite un reporte: conserva claims OBSERVED/RULE-BASED del baseline si pasan validación estructural y deja MODEL-INFERRED como no revisados o rechazados por falta de reviewer, según cobertura. Nunca fabrica aceptación.

## Reporte y anomalías

El reporte incluye modo `synthetic|testnet_live`, identificador de input, snapshot, corpus snapshot, provider/prompt/policy versions y warning permanente `REVIEW_IS_NOT_A_SECURITY_AUDIT`. Datos sintéticos permanecen etiquetados. Una fuente documental nunca acredita ejecución de una transacción particular.

`Anomaly` referencia un claim existente y usa sólo las tres clases permitidas. Un umbral educativo, si se aplica, declara regla, versión, ventana y límites; no prueba daño ni fraude. Sin baseline estadístico no se usa “inusual para esta wallet”.

Estados de claim publicados: `supported` aparece en conclusiones; `rejected` y `needs_revision` permanecen en auditoría con motivo. Tras una corrección máxima, cualquier defecto deja el reporte `inconclusive` con hechos validados visibles.

## Presupuestos y degradación

M7 comparte el presupuesto global M6: 90 s, 24 tools ya usadas por analistas, 20.000/4.000 tokens, 2 tools concurrentes. Evidence/Reviewer no añaden tools, pero sí pueden consumir llamadas de modelo: máximo 2 por rol más la corrección global única del run. Timeout, schema inválido persistente o presupuesto agotado conserva baseline validado y declara faltantes.

## Verificación

Fixtures scripted cubren: cita válida que no sustenta el texto; evidence id ajeno; snapshot incompatible; docs conflicting; evento Transfer elevado a ownership; atribución de fraude; receipt ausente; provider ausente; schema de reviewer inválido y corregible; defecto persistente. Gates: 100% ids publicados resolubles, cero acusaciones automáticas, cero MODEL-INFERRED promocionados a OBSERVED, cero `accepted` con claims no supported, y abstención correcta cuando falta soporte.

Tests y CLI son offline. No hay ejecución live de modelo ni blockchain en `npm run check`.
