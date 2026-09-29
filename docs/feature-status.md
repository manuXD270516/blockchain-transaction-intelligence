# Funcionalidades y status

Actualizado: 2026-09-29, después de M4. Implementado significa código ejecutable; validado localmente no implica CI remota ni todos los requisitos M0–M11 completos. Las especificaciones de fundación siguen abiertas.

| Hito | Funcionalidad | Estado | Evidencia / límite |
|---|---|---|---|
| Fundación | Scope, threat model, dominio, datos, arquitectura y roadmap | Especificado, OpenSpec validado | openspec/changes/define-transaction-intelligence-foundation |
| M0 | Bootstrap TypeScript estricto, build, typecheck, lockfile | Implementado y validado localmente | npm run check |
| M0 | Manifest versionado y validación runtime | Implementado y validado localmente | schema/roles/campos extra/límites en tests |
| M0 | Loader con SHA-256 y protección de rutas | Implementado y validado localmente | corrupción, tamaño, escape y junction |
| M0 | Fixtures success/reverted/pending | Implementado y validado localmente | escenarios synthetic, no capturas públicas |
| M0 | CLI replay JSON determinístico | Implementado y validado localmente | repetición byte a byte, independiente del cwd |
| M0 | Ejecución offline de replay | Implementado y validado con guard local | guard de regresión, no sandbox hostil |
| M0 | CI Linux con red aislada y symlink de archivo | Configurado, ejecución remota pendiente | test de symlink de archivo omitido en Windows |
| M1 | Interfaz ChainAdapter y FixtureAdapter | Implementado y validado localmente | investigate común; procedencia synthetic |
| M1 | Ethereum Sepolia/PublicNode | Implementado y probado live | chain 11155111, smoke de bloque finalized |
| M1 | Obtención de transaction y receipt | Implementado, probado con RPC simulado | validación de hash/status/snapshot/logs; expuesto por M4 |
| M1 | Lectura de bloques por hash/número/tag | Implementado, validado localmente y smoke live | tags latest/safe/finalized; sin pending |
| M1 | Balance nativo por bloque | Implementado y probado con RPC simulado | wei raw, cero distinto de error; sin tokens/fiat |
| M1 | Bytecode por bloque | Implementado y probado con RPC simulado | sin ABI/proxy/identificación de protocolo |
| M1 | Logs raw por dirección/bloque | Implementado y probado con RPC simulado | M4 compone rangos acotados y paginación |
| M1 | Chain mismatch y coherencia de snapshot/reorg | Implementado y probado con RPC simulado | relectura canónica; proveedor único no es prueba trustless |
| M1 | Pending/not_found/receipt ausente/pruned | Implementado y probado con RPC simulado | errores/cobertura explícitos, no valores inventados |
| M1 | Allowlist RPC y política de endpoint/DNS | Implementado y validado localmente | HTTPS fijo, IPv4 público, sin redirects ni URL de usuario |
| M1 | Timeout, deadline, presupuesto, retry y límite body | Implementado y validado localmente | 10s/90s/24 intentos/2 intentos por lectura/2MiB |
| M1 | Procedencia raw y journal de llamadas | Implementado y validado localmente | bytes UTF-8/hash en memoria; preservados también en error |
| M2 | Modelo canónico transaction/receipt/block/logs | Implementado y validado localmente | cantidades decimales exactas, campos opcionales y raw completo |
| M2 | Creación, tipo desconocido y estados separados | Implementado y validado localmente | no inventa destino, causa de revert ni cobertura completa |
| M2 | Fees execution/blob/total | Implementado y validado localmente | BigInt; total desconocido ante datos/semántica insuficientes |
| M2 | Evidencia content-addressed y transformaciones versionadas | Implementado y validado localmente | DAG autocontenido, hashes y JSON Pointers verificables; deep-frozen |
| M2 | CLI de normalización fixture/live | Implementado y validado localmente | offline bajo guard; rama live verificada con transporte simulado |
| M7/M10 | Evidence store persistente multi-investigación y retención | Diferido explícitamente | M2 entrega bundle JSON exportable; sin base de datos |
| M3 | Decodificación de eventos estándar | Implementado y validado localmente | layouts canónicos ERC-20/721/1155; desconocidos, ambiguos y malformados se conservan |
| M3 | Extracción ERC-20, ERC-721 y ERC-1155 | Implementado y validado localmente | semántica event_reported; lotes atómicos; sin balances netos ni prueba de conformidad |
| M3 | Evidencia derivada y grafo base | Implementado y validado localmente | hashes, padres, pointers y edges transaction/emitter/transfer |
| M3 | Límites defensivos | Implementado y validado localmente | 128 KiB/log, 1024 ítems/lote, 10k logs y transferencias por ejecución |
| M3 | Fixture y CLI de extracción offline/live | Implementado y validado localmente | synthetic-token-events; salida determinística y deep-frozen |
| M3 | Trazas, llamadas internas y revert reason | Pendiente | capability unsupported; causa del revert desconocida |
| M3 | Identificación histórica de contratos/proxies | Pendiente | getCode no identifica protocolo ni seguridad |
| M4 | blockchain-mcp-server/stdin-stdout | Implementado y validado localmente | MCP 2026-07-28, 9 tools, manifest `.cursor/mcp.json`; CI remota pendiente |
| M4 | get_transaction | Implementado y validado con RPC simulado | normalización, evidencia, pending/not_found y snapshot explícitos |
| M4 | get_receipt | Implementado y validado con RPC simulado | receipt ausente→unavailable; nunca infiere revert |
| M4 | get_block | Implementado y validado con RPC simulado | referencias hash/número/latest/safe/finalized; sin full transactions |
| M4 | get_wallet_balance | Implementado y validado con RPC simulado | balance nativo raw; sin tokens ni fiat |
| M4 | get_token_transfers | Implementado y validado con RPC simulado | sólo eventos estándar M3, páginas de hasta 100 |
| M4 | get_contract | Implementado y validado con RPC simulado | bytecode/hash; ABI, source y proxy preservados unknown |
| M4 | get_contract_events | Implementado y validado con RPC simulado | máximo 100 bloques, `{raw, decoded}`, orden estable y cursor ligado a snapshots |
| M4 | trace_transaction | Abstención implementada y validada | devuelve unavailable/UNSUPPORTED_CAPABILITY; no RPC debug |
| M4 | search_protocol_docs | Abstención implementada y validada | devuelve unavailable/CORPUS_NOT_CONFIGURED; sin RAG |
| M4 | Envelopes, límites y errores públicos | Implementado y validado localmente | 100 elementos/página, 2 MiB, HMAC con expiración, mensajes sin eco de input/proveedor |
| M5 | Ingesta de Ethereum/protocol/contract docs, patrones y auditorías | Especificado; pendiente | corpus aún no cargado |
| M5 | Búsqueda híbrida, versionado, filtros y citas verificables | Especificado; pendiente | sin índice/embeddings |
| M6 | Transaction Analyst | Especificado; pendiente | sin llamadas a modelos |
| M6 | Contract Analyst | Especificado; pendiente | sin llamadas a modelos |
| M6 | Orquestador, límites por rol y presupuestos LLM | Especificado; pendiente | presupuesto RPC M1 no equivale al de agentes |
| M7 | Evidence Agent | Especificado; pendiente | validadores de adquisición no sustituyen este rol |
| M7 | Reviewer Agent | Especificado; pendiente | sin revisión semántica |
| M7 | Claims OBSERVED/RULE-BASED/MODEL-INFERRED | Especificado; pendiente | aún no se generan claims |
| M7 | Clasificación de anomalías sin atribución automática de fraude | Especificado; pendiente | sin motor detector |
| M7 | Reporte con citas, contradicciones y abstención | Especificado; pendiente | resultado actual es adquisición/normalización, sin revisión semántica |
| M8 | Grafo de transacciones y UI con evidencia | Especificado; pendiente | sin frontend |
| M9 | Evals de reconstrucción, eventos y contratos | Especificado; pendiente | tests M0–M2 no son estos benchmarks |
| M9 | Evals de tools, citas, retrieval y unsupported claims | Especificado; pendiente | sin agentes/corpus |
| M9 | Latencia, tokens, cobertura y comparación de experimentos | Parcial | duración/intentos RPC; runner y tokens LLM pendientes |
| M10 | Trazabilidad, OpenTelemetry, redacción y alertas | Parcial | errores seguros/journal local; instrumentación global pendiente |
| M10 | Retención, borrado y aislamiento de investigaciones | Especificado; pendiente | no servicio multiusuario |
| M11 | Demo pública educativa y hosting | Pendiente | sólo CLI local |
| Exclusiones | Inversiones, bot financiero, custodia, firma, envío de fondos | Fuera de alcance | sin signer ni métodos RPC mutantes |

Siguiente hito propuesto: **M5 — corpus y retrieval**, pero debe comenzar con su propio change OpenSpec. Tracing y nuevas redes también requieren contratos separados antes de habilitarse.
