# M0: diseño implementable

## Estructura

`src/domain` define contratos y errores; `src/fixtures` valida y carga; `src/replay.ts` produce un resumen determinístico; `src/cli.ts` admite únicamente `replay <fixture-id>`. `fixtures/<id>/manifest.json` referencia payloads locales; `test` contiene oráculos y pruebas. Node 22, TypeScript estricto y node:test, sin dependencias de runtime. Versiones exactas en package-lock; instalación de dependencias puede necesitar red, replay y tests no.

## Manifest v1

Objeto cerrado: schema_version=1.0.0, fixture_id (slug), scenario_id con prefijo synthetic:, source_kind=synthetic, chain_id decimal positivo (31337 para ejemplos locales), description, captured_at ISO UTC, source {publisher, uri=null, license}, adapter_version=fixture-loader/1.0.0, decoder_version=null, corpus_snapshot=null, split=dev|test, capabilities {receipts, logs, historical_state, safe_finalized, trace, abi_enrichment}, snapshot {tx_hash, block_hash nullable, block_number decimal nullable}, artifacts de roles transaction/receipt/block.

Cada artifact: role, file (basename JSON solamente), sha256 (64 hex lowercase), bytes (1–2 MiB). Exactamente los tres roles; receipt y block pueden contener JSON null. Manifest máximo 64 KiB. Los fixtures de M0 son exclusivamente sintéticos; public_snapshot/testnet_capture requieren un change posterior con procedencia real. Ningún manifest contiene golden esperado ni instrucciones para agentes.

Payloads conservan JSON-RPC result raw y campos extra; validar campos mínimos necesarios para el resumen. Cantidades RPC son hex quantity canónico, hashes 32 bytes y direcciones 20 bytes lowercase. Validar transaction/hash, receipt.transactionHash, block.hash/number, referencias cruzadas, status 0x0/0x1, logs como array y presencia del tx en block.transactions. M0 no decodifica logs ni valida exhaustivamente todos los campos de Ethereum: aceptar un payload aquí no certifica conformidad completa del protocolo. Cantidades y campos nuevos no se convierten a float.

La transacción existe en los tres casos M0. blockHash/blockNumber ambos null indica pending sólo cuando receipt y block son null y manifest coincide. Transacción incluida con receipt ausente mantiene ejecución unknown y coverage partial. Receipt presente requiere bloque coherente; nunca inferir éxito por falta de receipt. Estados de este resumen son observaciones mecánicas, no revisión de evidencia de M7.

## Seguridad e integridad

fixture-id restringido a slug, sin paths. Resolver realpath del root/fixture/artifacts y exigir pertenencia; bloquear symlinks que escapen. Abrir sólo archivos regulares; read acotado en el descriptor y hash sobre los mismos bytes analizados, sin confiar sólo en stat. Validar bytes y checksum antes de parsear JSON. Límite de 3 artifacts; rechazo de schema/version desconocido, roles duplicados y propiedades extra en manifest. Payloads extra se preservan. Archivos locales administrados: no se promete aislamiento ante un proceso hostil que reemplace directorios concurrentemente; el despliegue deberá hacer el fixture root de sólo lectura.

El hash acredita coincidencia con manifest, no autenticidad: un atacante que cambie ambos puede fabricar datos. Ningún dato sintético se presenta como captura real. Errores tipados evitan volcar payloads/rutas/credenciales al CLI. Resultados deep-frozen para prevenir cambios accidentales posteriores a verificación.

## Replay

Resumen JSON v1 estable: fixture/scenario/source, chain, snapshot, execution_status, coverage, raw_log_count, hashes de manifest/artifacts y replay_id SHA-256 derivado de manifest hash + versión del replayer. No timestamps de ejecución ni latencia en el resumen canónico; CI puede medir wall-clock externamente en fases posteriores. Advertencia fija de datos sintéticos. No eventos decodificados, inferencias, tokens LLM ni reportes reviewed. Raw payloads permanecen disponibles al consumidor del loader, no se imprimen íntegros.

CLI sin configuración de red y sin pass-through; stdout sólo JSON, stderr errores breves, exit 0 éxito, 1 fixture inválido/lectura fallida, 2 uso inválido. Bundled root relativo al módulo compilado, independiente del cwd. Tests locales ejecutan el CLI con un guard de imports que permite sólo módulos locales y builtins de archivos/hash/path, y bloquea fetch/WebSocket. Es un guard de regresión, no un sandbox de código hostil. CI Linux ejecuta la suite dentro de un network namespace sin conectividad externa. El permission model de Node 22 no restringe red; no se lo presenta como prueba de aislamiento (https://nodejs.org/download/release/v22.17.0/docs/api/permissions.html).
