# Funcionalidades y status

Actualizado: 2026-09-29, después de crear el change OpenSpec de M7. Implementado significa código ejecutable; validado no implica todos los requisitos M0–M11 completos. Las especificaciones de fundación siguen abiertas.

| Hito | Funcionalidad | Estado | Evidencia / límite |
|---|---|---|---|
| Fundación | Scope, threat model, dominio, datos, arquitectura y roadmap | Especificado, OpenSpec validado | openspec/changes/define-transaction-intelligence-foundation |
| M0 | Bootstrap TypeScript estricto, build, typecheck, lockfile | Implementado y validado localmente | npm run check |
| M0 | Manifest versionado y validación runtime | Implementado y validado localmente | schema/roles/campos extra/límites en tests |
| M0 | Loader con SHA-256 y protección de rutas | Implementado y validado localmente | corrupción, tamaño, escape y junction |
| M0 | Fixtures success/reverted/pending | Implementado y validado localmente | escenarios synthetic, no capturas públicas |
| M0 | CLI replay JSON determinístico | Implementado y validado localmente | repetición byte a byte, independiente del cwd |
| M0 | Ejecución offline de replay | Implementado y validado con guard local | guard de regresión, no sandbox hostil |
| M0 | CI Linux con red aislada y symlink de archivo | Implementado y validado remotamente | GitHub Actions ejecutó tests en namespace sin red; symlink cubierto en Linux |
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
| M4 | blockchain-mcp-server/stdin-stdout | Implementado y validado local y remotamente | MCP 2026-07-28, 9 tools, manifest `.cursor/mcp.json`; CI Linux aprobada |
| M4 | get_transaction | Implementado y validado con RPC simulado | normalización, evidencia, pending/not_found y snapshot explícitos |
| M4 | get_receipt | Implementado y validado con RPC simulado | receipt ausente→unavailable; nunca infiere revert |
| M4 | get_block | Implementado y validado con RPC simulado | referencias hash/número/latest/safe/finalized; sin full transactions |
| M4 | get_wallet_balance | Implementado y validado con RPC simulado | balance nativo raw; sin tokens ni fiat |
| M4 | get_token_transfers | Implementado y validado con RPC simulado | sólo eventos estándar M3, páginas de hasta 100 |
| M4 | get_contract | Implementado y validado con RPC simulado | bytecode/hash; ABI, source y proxy preservados unknown |
| M4 | get_contract_events | Implementado y validado con RPC simulado | máximo 100 bloques, `{raw, decoded}`, orden estable y cursor ligado a snapshots |
| M4 | trace_transaction | Abstención implementada y validada | devuelve unavailable/UNSUPPORTED_CAPABILITY; no RPC debug |
| M4/M5 | search_protocol_docs | Implementado y validado localmente | corpus local M5; unavailable/CORPUS_NOT_CONFIGURED si falta o no pasa integridad |
| M4 | Envelopes, límites y errores públicos | Implementado y validado localmente | 100 elementos/página, 2 MiB, HMAC con expiración, mensajes sin eco de input/proveedor |
| M5 | Corpus curado y versionado | Implementado y validado local y remotamente | 6 documentos/139 chunks; EIPs CC0, OpenZeppelin MIT, dos majors incompatibles y auditoría con alcance |
| M5 | Ingesta administrativa allowlisted | Implementado y validado localmente | lock SHA-256, hosts/DNS públicos, límites, Markdown/PDF; única fase con red |
| M5 | Loader de snapshots inmutables | Implementado y validado localmente | rutas, tamaños, hashes, modelo, vectores y spans exactos verificados antes de buscar |
| M5 | Búsqueda híbrida y filtros | Implementado y validado localmente | BM25 + MiniLM 384d local + cosine + RRF; filtros protocol/version/chain |
| M5 | Citas, compatibilidad y abstención | Implementado y validado localmente | matched/generic/unknown/conflicting; no-answer→[]; contenido hostil no amplía autoridad |
| M5 | Qrels y gates de retrieval | Implementado y validado localmente | Recall@5 1,00; MRR@10 0,867; abstención 1,00; versión segura |
| M6 | Baseline determinístico | Implementado y validado local y remotamente | claims OBSERVED/RULE-BASED con evidencia; disponible aunque falte modelo |
| M6 | Transaction Analyst | Implementado con provider inyectable y validado offline | tools por rol y claims MODEL-INFERRED; sin provider remoto habilitado |
| M6 | Contract Analyst | Implementado con provider inyectable y validado offline | docs incompatibles no sustentan claims; identidad unknown preservada |
| M6 | Orquestador y presupuestos | Implementado y validado localmente | 90 s, 24 tools, 20k/4k tokens, 5 llamadas modelo y una corrección |
| M6 | Tool selection y policy | Implementado y validado localmente | 1,00 en 5 casos; cero ejecuciones prohibidas |
| M6 | Reporte aceptado/revisado | Diferido explícitamente a M7 | M6 entrega analysis_draft con claims proposed y REVIEW_NOT_RUN |
| M7 | Evidence Agent | Change OpenSpec creado; no implementado | add-evidence-review-pipeline; sin tools externas |
| M7 | Reviewer Agent | Change OpenSpec creado; no implementado | entailment y límites de alcance pendientes de código |
| M7 | Revisión de claims OBSERVED/RULE-BASED/MODEL-INFERRED | Change OpenSpec creado; no implementado | M6 ya genera claims proposed; M7 debe pasarlos a supported/rejected/needs_revision |
| M7 | Clasificación de anomalías sin atribución automática de fraude | Change OpenSpec creado; no implementado | anomalías sólo como claims tipados |
| M7 | Reporte accepted/partial/inconclusive | Change OpenSpec creado; no implementado | M6 sigue entregando analysis_draft con REVIEW_NOT_RUN |
| M8 | Grafo de transacciones y UI con evidencia | Especificado; pendiente | sin frontend |
| M9 | Evals de reconstrucción, eventos y contratos | Especificado; pendiente | tests M0–M2 no son estos benchmarks |
| M9 | Evals de tools, citas, retrieval y unsupported claims | Especificado; pendiente | sin agentes/corpus |
| M9 | Latencia, tokens, cobertura y comparación de experimentos | Parcial | duración/intentos RPC; runner y tokens LLM pendientes |
| M10 | Trazabilidad, OpenTelemetry, redacción y alertas | Parcial | errores seguros/journal local; instrumentación global pendiente |
| M10 | Retención, borrado y aislamiento de investigaciones | Especificado; pendiente | no servicio multiusuario |
| M11 | Demo pública educativa y hosting | Pendiente | sólo CLI local |
| Exclusiones | Inversiones, bot financiero, custodia, firma, envío de fondos | Fuera de alcance | sin signer ni métodos RPC mutantes |

Siguiente hito: **implementar M7** según `openspec/changes/add-evidence-review-pipeline`. No hay código de Evidence/Reviewer ni reportes accepted todavía. Tracing, proveedores remotos y nuevas redes también requieren contratos/configuración explícita antes de habilitarse.
