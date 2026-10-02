# Funcionalidades y status

Actualizado: 2026-10-02. M0–M11 y las trazas de llamadas offline están verificados localmente y en GitHub Actions (run [36948710154](https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36948710154); ver docs/verification.md). Implementado significa código ejecutable; validado no implica todos los requisitos M0–M11 completos. Los changes de cada hito están archivados. Los requisitos diferidos de la fundación se implementaron el 2026-10-02 (change complete-foundation-deferred-requirements) y están verificados en Windows y en un contenedor Linux sin red; su CI remota queda pendiente del próximo push.

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
| M7/M10 | Evidence store persistente multi-investigación y retención | Parcial: store local de runs (M10) | reporte + traza por run en `.runs/`, retención y borrado; sin base de datos ni servicio multiusuario |
| M3 | Decodificación de eventos estándar | Implementado y validado localmente | layouts canónicos ERC-20/721/1155; desconocidos, ambiguos y malformados se conservan |
| M3 | Extracción ERC-20, ERC-721 y ERC-1155 | Implementado y validado localmente | semántica event_reported; lotes atómicos; sin balances netos ni prueba de conformidad |
| M3 | Evidencia derivada y grafo base | Implementado y validado localmente | hashes, padres, pointers y edges transaction/emitter/transfer |
| M3 | Límites defensivos | Implementado y validado localmente | 128 KiB/log, 1024 ítems/lote, 10k logs y transferencias por ejecución |
| M3 | Fixture y CLI de extracción offline/live | Implementado y validado localmente | synthetic-token-events; salida determinística y deep-frozen |
| M3 | Trazas de llamadas, llamadas internas y revert reason | Implementado offline (fixtures) y validado localmente | callTracer sintético con checksums; trace_path, revert propio/ancestral, DELEGATECALL contexto/código sin valor efectivo, límites 1000 frames/profundidad 64; revert reason sólo si el tracer lo reporta |
| M3 | Tracing live (`debug_traceTransaction`) | Configuración lista, ejecución pendiente de proveedor | backend deshabilitado por defecto con `callTracer` fijo, host HTTPS por configuración y tests con transporte simulado; fuera de la allowlist principal; change enable-live-tracing |
| M3 | Identificación histórica de contratos/proxies | Implementado y validado localmente | code hash y slot EIP-1967 por bloque, ABI sólo desde registro con procedencia; proxy actualizado sin ABI histórica queda unknown; registro incluido sintético |
| M4 | blockchain-mcp-server/stdin-stdout | Implementado y validado local y remotamente | MCP 2026-07-28, 9 tools, manifest `.cursor/mcp.json`; CI Linux aprobada |
| M4 | get_transaction | Implementado y validado con RPC simulado | normalización, evidencia, pending/not_found y snapshot explícitos |
| M4 | get_receipt | Implementado y validado con RPC simulado | receipt ausente→unavailable; nunca infiere revert |
| M4 | get_block | Implementado y validado con RPC simulado | referencias hash/número/latest/safe/finalized; sin full transactions |
| M4 | get_wallet_balance | Implementado y validado con RPC simulado | balance nativo raw; sin tokens ni fiat |
| M4 | get_token_transfers | Implementado y validado con RPC simulado | sólo eventos estándar M3, páginas de hasta 100 |
| M4 | get_contract | Implementado y validado con RPC simulado | bytecode/hash; ABI, source y proxy preservados unknown |
| M4 | get_contract_events | Implementado y validado con RPC simulado | máximo 100 bloques, `{raw, decoded}`, orden estable y cursor ligado a snapshots |
| M4 | trace_transaction | Abstención live; backend de trazas opcional validado con tests | Sepolia: unavailable/UNSUPPORTED_CAPABILITY sin RPC debug; backend inyectado: ok o partial con truncación explícita |`n| M4 | get_contract con proxy e identidad | Implementado y validado con RPC simulado | `eth_getStorageAt` sólo slot EIP-1967 en bloque fijado; proxy/implementation/identity con evidencia; slot ilegible → proxy unknown |
| M4/M5 | search_protocol_docs | Implementado y validado localmente | corpus local M5; unavailable/CORPUS_NOT_CONFIGURED si falta o no pasa integridad |
| M4 | Envelopes, límites y errores públicos | Implementado y validado localmente | 100 elementos/página, 2 MiB, HMAC con expiración, mensajes sin eco de input/proveedor |
| M5 | Corpus curado y versionado | Implementado y validado local y remotamente | 6 documentos/139 chunks; EIPs CC0, OpenZeppelin MIT, dos majors incompatibles y auditoría con alcance |`n| M5 | Registro de versiones y resolución de citas | Implementado y validado localmente | `corpus/snapshots/index.json` append-only con linaje por URI; cita del snapshot original sigue resolviendo tras una versión nueva (probado con snapshot derivado) |
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
| M6 | Reporte aceptado/revisado | Entregado por M7 | el analysis_draft M6 sigue siendo proposed; runReviewed añade la revisión |
| M7 | Evidence Agent | Implementado con provider inyectable y validado offline | sin tools; hallazgos cerrados; peticiones de evidencia sólo sobre artefactos del run |
| M7 | Reviewer Agent | Implementado con provider inyectable y validado offline | veredicto por claim con reasons versionadas; no sustituye a los validadores |
| M7 | Validadores estructurales | Implementado y validado localmente | ids/hash/DAG, snapshots, documentos conflicting, clases, overreach de eventos y lenguaje prohibido |
| M7 | Revisión de claims OBSERVED/RULE-BASED/MODEL-INFERRED | Implementado y validado localmente | supported/rejected/needs_revision; consenso no promociona MODEL-INFERRED |
| M7 | Anomalías sin atribución automática de fraude | Implementado y validado localmente | receipt revertido (OBSERVED) y umbral educativo de 20 eventos (RULE-BASED); sin anomalías de modelo |
| M7 | Reporte accepted/partial/inconclusive | Implementado y validado (local y CI remota) | CLI offline; sin provider queda inconclusive con hechos validados |`n| M7 | Reporte revisado con trazas | Implementado y validado localmente | `--with-trace`: claims OBSERVED de subllamada revertida/revert reason/DELEGATECALL con evidencia por frame y anomalía `trace_reports_reverted_subcall`; sin traza, reporte idéntico |
| M7 | Eval de citas y unsupported claims | Implementado y validado localmente | 11 casos; status 1,00 y cero en evidencia irresoluble, acusaciones, promociones, accepted no soportado y tools |
| M8 | Grafo de transacciones con evidencia | Implementado y validado localmente | HTML/SVG estático sin scripts, CSP, anclas por arista, executed/reverted/unknown, truncación a 200 |
| M8 | Llamadas internas en el grafo | Implementado con trazas offline y validado localmente | `--with-trace`: aristas `internal_call` executed/reverted con evidencia por frame; sin traza: `NO_CALL_TRACE` y vista idéntica |
| M9 | Evals de reconstrucción, eventos, orden, anomalías y contratos | Implementado y validado localmente | golden manual de 4 casos; F1 1,00; identificación de contratos N/A (0 identificados), abstención 5/5 |
| M9 | Evals de tools, citas, retrieval y unsupported claims | Implementado y validado localmente | sub-suites M5–M7 bajo el runner; gates de seguridad bloquean release |
| M9 | Latencia, tokens, cobertura y comparación de experimentos | Implementado y validado localmente | latencia offline sin modelo (no SLA); tokens `unavailable`; `compare` sólo con la misma `comparable_key` |
| M9 | Latencia con modelo real | No aplicable todavía | sin provider remoto; gate de 30 s queda not_applicable |
| M10 | Trazas correlacionadas y OTLP-JSON local | Implementado y validado localmente | spans run/analysis/model/tool/review; sin pregunta en claro ni prompts; sin collector |
| M10 | Redacción de secretos | Implementado y validado localmente | Bearer/Basic, claves sensibles, userinfo, query y rutas de proveedores; hashes y direcciones intactos |
| M10 | Retención y borrado de runs | Implementado y validado localmente | 30 días local, 24 h demo; raíces protegidas; ids hex |
| M10 | Cuotas por identidad | Implementado y validado localmente | `RunQuota`: ventana fija, runs y concurrencia por identidad hasheada; `RATE_LIMITED` antes de trabajar; en memoria, para un futuro transporte remoto |`n| M10 | Alertas | Diferido | sin servicio ni visitantes; budgets por run siguen activos |
| M11 | Sitio de demo estático | Implementado y validado localmente | 4 fixtures curados, límites y privacidad visibles, auditoría de HTML, bloqueo por gates |
| M11 | Hosting y publicación | Workflow listo; no publicado | `Publish demo` con gates, verificación en disco y en vivo (`published: true` sólo tras comparar bytes); falta habilitar Pages y push |
| Exclusiones | Inversiones, bot financiero, custodia, firma, envío de fondos | Fuera de alcance | sin signer ni métodos RPC mutantes |

Pendiente: habilitar GitHub Pages y publicar la demo (M11 3.2 y publish-demo-github-pages 2.4–2.5), CI remota de complete-foundation-deferred-requirements y ejecución de tracing live (enable-live-tracing, requiere proveedor). La CI Linux remota de todos los hitos quedó registrada el 2026-10-02. Tracing, proveedores remotos, nuevas redes y cualquier servicio con visitantes requieren contratos y configuración explícitos antes de habilitarse. Los changes de cada hito se archivaron el 2026-10-02; siguen abiertos `prepare-public-demo`, `publish-demo-github-pages`, `complete-foundation-deferred-requirements`, `enable-live-tracing` y `define-transaction-intelligence-foundation`.
