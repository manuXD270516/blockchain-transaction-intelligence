# Estrategia de evaluación

## Fixtures y reproducción

Fixtures futuros versionados: manifest con scenario_id, source_kind (synthetic/public_snapshot/testnet_capture), chain_id, tx/block hashes cuando existen, capture_time, source/license, raw checksums, adapter/decoder versions, expected capabilities, expected evidence/claims, corpus snapshot y split. Synthetic usa namespace y etiqueta explícitos, sin presentar hashes inventados como capturas públicas. Capturas se sanitizan sin alterar campos on-chain; secretos de transporte se excluyen antes de guardar.

Guardar raw RPC/receipts/logs/trazas y respuestas ausentes/errores, golden normalizado, grafo esperado y oráculo privado al agente. Replay offline no hace llamadas externas; compara normalización determinística y soporte del reporte, sin exigir redacción idéntica del LLM. Fijar prompts/modelo/config/seed si disponible; conservar outputs y usage. Modelo remoto puede cambiar: repetir tres runs por caso para medir variación y reportar proveedor/fecha, sin prometer reproducción bit a bit.

Suite mínima prevista: transferencia nativa exitosa; creación de contrato; ERC-20 con y sin decimals; ERC-721; ERC-1155 single/batch; Transfer ambiguo/falso; swap sintético multihop; revert con razón; revert sin razón; subcall revert capturado; pending/not-found; logs desconocidos/malformados; proxy actualizado/ABI histórica ausente; trace no soportada/pruned/truncada; RPC inconsistente/reorg; tipos/fees desconocidos; docs incompatibles/sin respuesta; injection en log/doc; timeout/cuota; intento de tool prohibida; uint256 grande; paginación. Casos pueden tener variantes, pero cada variante tiene id propio.

Splits por familia/protocolo/versión para reducir leakage; no dividir copias de la misma transacción entre train/dev/test. Golden y qrels con revisión humana; correcciones del oráculo cambian versión, no el resultado histórico. No usar LLM judge como único gate. Integración live testnet es opt-in y se reporta aparte de regresión offline.

## Métricas

| Métrica | Definición / manejo de ausentes |
|---|---|
| Reconstruction correctness | Precision/recall/F1 de tuplas golden (actor, acción, objeto, cantidad, estado) y accuracy de pares de orden comparables; sin traza no exigir orden causal no observable |
| Event extraction | P/R/F1 de (emisor, log_index, firma, argumentos raw) en eventos decodificables; además retención raw de logs no decodificables |
| Contract identification | Precision de identificaciones soportadas entre identificaciones emitidas; recall sobre contratos identificables del golden; abstención correcta en desconocidos |
| Tool selection | Fracción de casos que satisfacen conjunto mínimo de capacidades válidas y no hacen llamadas prohibidas; llamadas innecesarias/total; aceptar secuencias equivalentes |
| Evidence citation | Referencias resolubles/refs emitidas; claims sustantivos con soporte válido/claims sustantivos; entailment humano por claim y compatibilidad de snapshot |
| Retrieval quality | Recall@5 = relevantes recuperados en 5 / relevantes del qrel; MRR@10; nDCG@10 si relevancia graduada; queries sin relevantes se evalúan como abstención correcta |
| Unsupported claims | Claims sin soporte o con alcance excesivo/claims sustantivos; reportar también cantidad absoluta y severidad, incluyendo acusaciones de intención |
| Anomaly labels | Accuracy de clasificación vs golden; presencia de regla/version/umbral cuando corresponde; tasa de acusaciones automáticas |
| Latency | Wall-clock input→reporte, p50/p95, tiempo por etapa; fallos/timeouts se incluyen y cuentan aparte; cache fría/caliente separadas |
| Tokens | Entrada/salida/cache/reasoning si el proveedor informa, por llamada/agente/run; unavailable si falta usage, estimaciones separadas y etiquetadas |
| Coverage | Casos ejecutados/planificados y completados/ejecutados, proporción partial/abstention/error; evita mejorar precision ocultando casos |

Denominador cero→N/A, nunca 100%. Reportar micro y macro por familia, n y conteos, no sólo agregados. Comparaciones pareadas con mismo fixture/corpus/config y presupuestos; cambios de modelo se identifican como variable. Benchmark no calibra probabilidades de intención ni fraude.

## Gates propuestos (no medidos)

- Seguridad/integridad: cero llamadas mutantes o escapes de política, cero citas fabricadas, cero acusaciones automáticas de fraude/scam/intención; 100% claims publicados con clase y referencias verificables. Cualquier incumplimiento bloquea release.
- Baseline determinístico: 100% campos raw/golden exactos, precisión entera y conservación de logs; 100% escenarios negativos con estado esperado. No se tolera silent truncation.
- M6–M9: reconstruction F1 ≥0,95; extracción estándar soportada exacta al 100%; precision de identificación contractual 1,00 y recall ≥0,90 sobre identificables; tool selection ≥0,95; Recall@5 ≥0,85, MRR@10 ≥0,80; cero unsupported claims sustantivos en suite de aceptación; abstención correcta ≥0,95 en casos sin respuesta. Publicar cobertura junto al gate.
- Objetivo operativo inicial: p95 ≤30 s en fixture offline con modelo configurado y ≤90 s en testnet; respetar hard budget MCP. Medir mínimo 30 runs indicando hardware/modelo/concurrencia; no afirmar SLA antes de medir.

Si una meta falla, registrar regresión y corregir o revisar explícitamente el change; nunca bajar umbrales de forma silenciosa. La suite de aceptación finita no demuestra ausencia universal de errores.

## Observabilidad

Trace_id correlaciona run, tools, agente, retrieval, claims y revisión. Spans registran versiones, snapshot ids, estados, latencia, retries, token usage y budget restante; no secretos ni raw prompts por defecto. Errores parciales son visibles; contadores de reorg, cita rechazada, timeout e inferencia no soportada permiten detectar regresiones. Exportación OpenTelemetry se decide en M10; manifest local existe desde M0. Tests de retención/redacción y aislamiento preceden demo pública.
