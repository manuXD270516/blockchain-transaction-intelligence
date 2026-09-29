## 1. Fundación documental (este change)

- [x] 1.1 Definir scope, datos, dominio y arquitectura en design.md.
- [x] 1.2 Definir threat model y límites de agentes en threat-model.md y agent-boundaries.md.
- [x] 1.3 Definir contratos MCP, evidencia, RAG y anomalías con escenarios normativos.
- [x] 1.4 Definir estrategia de evaluación y roadmap M0–M11.

## 2. Implementación por hitos — autorizada posteriormente el 2026-09-24

- [x] 2.1 M0: change bootstrap-offline-foundation, fixture loader y CI configurado; replay/manifest validados localmente. Ejecución CI Linux pendiente en su change.
- [x] 2.2 M1: change add-ethereum-readonly-adapter; adapters Sepolia/fixture, mismatch/reorg/pending/pruned y allowlist verificados con transporte simulado; smoke live de bloque realizado.
- [x] 2.3 M2: change normalize-transaction-evidence; normalización versionada y DAG de evidencia exportable, golden/uint256/null/snapshots verificados localmente. Persistencia multi-investigación diferida explícitamente a M7/M10.
- [ ] 2.4 M3: implementar extracción y grafo base; transaction-normalization, transaction-graph; verificar eventos ambiguos, batches y llamadas revertidas.
- [ ] 2.5 M4: implementar nueve tools stdio; blockchain-mcp; verificar schemas, límites, paginación, errores e intentos prohibidos.
- [ ] 2.6 M5: ingerir corpus aprobado e implementar retrieval; protocol-rag; verificar hashes/spans, qrels, compatibilidad y injection.
- [ ] 2.7 M6: implementar orquestador y roles analistas; bounded-agents; verificar permisos, budgets, selección de tools y claims estructurados.
- [ ] 2.8 M7: implementar Evidence/Reviewer y reportes; evidence-claims, bounded-agents; verificar rechazo de citas/claims falsos y abstención.
- [ ] 2.9 M8: visualizar grafo; transaction-graph; verificar aristas trazables, límites y render seguro.
- [ ] 2.10 M9: consolidar eval runner y comparaciones; evaluation-observability; verificar denominadores, gates, cobertura y splits.
- [ ] 2.11 M10: incorporar telemetría y retención; evaluation-observability; verificar correlación, redacción y borrado.
- [ ] 2.12 M11: preparar change de demo y despliegue; todas las capabilities; verificar seguridad, fixtures curados y gates antes de publicar.

No marcar tareas de implementación como completas por existir documentación. No archivar este change como realizado hasta verificar sus requisitos; futuros changes deberán mantener la trazabilidad de estos contratos y de cualquier delta.
