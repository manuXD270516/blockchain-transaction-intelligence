# Roadmap

Cada fila es un futuro change antes de código. Esta entrega sólo define la fundación; ni siquiera el bootstrap ejecutable se implementa ahora. Dependencias acumulativas salvo que se indique lo contrario.

| Hito | Alcance | Gate de salida |
|---|---|---|
| M0 Bootstrap | Estructura futura, schema/versionado, fixture loader, CI offline, manifest | Reproducir fixture sintético sin red; sin signer ni secretos; contratos validables |
| M1 Ethereum adapter | Fixture adapter y RPC de una testnet permitida, capabilities | Chain mismatch, pending, rate limit, pruned y reorg probados; cero RPC mutante |
| M2 Normalization | Tipos canónicos, snapshots, enteros, procedencia | Golden exacto, null/unknown preservados, cantidades grandes sin pérdida |
| M3 Event/token extraction | Logs raw, ERC-20/721/1155 y trace opcional | Casos estándar/ambiguos/reverts/batch; no atribuir saldo por eventos |
| M4 MCP server | Nueve tools, stdio, schemas, límites/paginación | Contract tests, policy enforcement, errores y budgets; sin pass-through |
| M5 Protocol RAG | Corpus curado, snapshots, búsqueda híbrida y citas | Qrels, versiones incompatibles, injection y abstención; metas retrieval |
| M6 Transaction Analyst | Baseline + Transaction/Contract roles, bounded orchestration | Reconstrucción y selección tools evaluadas; ningún texto sin schema de claim |
| M7 Evidence/Reviewer | Validadores y roles de revisión, reporte | Citas y clases verificables; unsupported bloqueado; reporte inconcluso ante falta de soporte |
| M8 Graph visualization | Vista de grafo del modelo normalizado | Cada arista abre evidencia; revert/unknown/event_reported visibles; XSS y truncación probados |
| M9 Evals | Runner consolidado, splits, dashboard de métricas | Suite reproducible, comparación pareada, gates y denominadores publicados |
| M10 Observability | Spans/métricas, redacción, cuotas, retención | Seguir run extremo a extremo; no secretos en telemetría; budgets y borrado probados |
| M11 Public demo | Fixtures curados, interfaz educativa, hosting por definir | Todas las gates previas; límites/privacidad visibles; sin wallet connection ni escritura on-chain |

La estructura de grafo se define desde M2–M3; M8 sólo incorpora su visualización. Evals y trazabilidad empiezan en M0 y crecen con cada hito, no se posponen hasta M9/M10. No publicar automáticamente al completar una fase de diseño.

Decisiones a fijar en sus changes: testnet/proveedor activo M1; implementación de tracer compatible M3; SDK/protocol version M4; licencias/corpus/embeddings M5; modelo y política de datos del proveedor M6; hosting y autenticación de demo M11. No bloquean la especificación ni autorizan integración externa hoy.
