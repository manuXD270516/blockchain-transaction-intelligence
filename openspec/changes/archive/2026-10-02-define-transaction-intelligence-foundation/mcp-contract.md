# Contrato de blockchain-mcp-server v1

Servidor local stdio. Negociar versión MCP soportada por SDK/cliente y fijarla en el manifest de M4. Cada tool declara inputSchema y outputSchema JSON Schema, `additionalProperties: false`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`. `openWorldHint` refleja backend: true para RPC externo, false para fixtures/corpus cerrado. Estos hints son descriptivos; allowlists y permisos hacen enforcement. Idempotencia no significa que una lectura de `latest` sea estable.

## Tipos comunes

- `ChainId`: string decimal positivo de una cadena habilitada; `Hash`: hex 32 bytes; `Address`: hex 20 bytes; validar checksum si mixed-case.
- `BlockRef`: exactamente uno de `{hash}`, `{number}` o `{tag: latest|safe|finalized}`; resolver tag a snapshot explícito. `pending` no es referencia válida para consultas de estado v1.
- `Page`: limit entero 1–100 (default 50), cursor opaco opcional firmado/validado y ligado a query, chain, snapshot y expiración. Cursor de otra consulta produce INVALID_CURSOR.
- Todos los límites y formatos se validan en servidor. Bytes hex pares; cantidades nunca números JS. No parámetros URL, RPC method, scripts, tracer code, SQL ni instrucciones ejecutables.

Respuesta normal `structuredContent`: `{schema_version, request_id, status, data, evidence_ids, snapshot, provenance, coverage, warnings, page}`. `status`: ok|partial|not_found|unavailable. `snapshot`: chain_id, block_hash/number, finality, observed_at; nullable para transacción no incluida y búsqueda de docs. `coverage`: scope, complete, missing[], truncated. `provenance`: adapter/provider logical id/version, fetched_at, raw_content_hash; nunca endpoint secreto. `page`: next_cursor|null. El texto MCP resume esta misma respuesta y no introduce hechos adicionales.

Errores operativos con `isError: true` y cuerpo validable `{schema_version, request_id, error:{code,message,retryable}, evidence_ids}`. Códigos: UNSUPPORTED_CHAIN, INVALID_INPUT, INVALID_CURSOR, POLICY_DENIED, RATE_LIMITED, TIMEOUT, PROVIDER_ERROR, INCONSISTENT_SNAPSHOT, BUDGET_EXCEEDED. Tool desconocida y mensajes MCP inválidos usan errores del protocolo. `not_found` significa no encontrado en esa fuente, no inexistencia universal; `unavailable` con warning UNSUPPORTED_CAPABILITY/PRUNED_STATE permite continuar con limitaciones.

## Tools

Los inputs listados son exhaustivos; `?` indica opcional. `chain_id` obligatorio en toda tool on-chain.

| Tool | Input | Data de salida y comportamiento |
|---|---|---|
| get_transaction | chain_id, tx_hash | Transaction canónica + raw ref; pending conserva snapshot null; null RPC→not_found |
| get_receipt | chain_id, tx_hash | Receipt con logs raw, status y gas; si falta, unavailable con RECEIPT_NOT_AVAILABLE, nunca asumir reverted |
| get_block | chain_id, block: BlockRef | Header + transaction hashes limitados a presupuesto; sin full transactions; truncación explícita |
| get_wallet_balance | chain_id, address, block: BlockRef | native asset, raw balance, snapshot; cero sólo si RPC devuelve cero; sin tokens ni estimación fiat |
| get_token_transfers | chain_id, tx_hash, page? | Transfer[] derivadas de receipt, estándar candidato, amount/token_id y evidence; alcance exclusivo de transacción |
| get_contract | chain_id, address, block: BlockRef | bytecode hash/ref, ABI/source refs si existen, verification provenance, proxy/implementation con certeza; unknown preservado |
| get_contract_events | chain_id, address, from_block: integer-string, to_block: integer-string, topics?: array de hasta 4 Hash o null, page? | Logs raw/decoded; rango máximo inclusivo 100 bloques, orden blockNumber/txIndex/logIndex, snapshots por bloque; no wildcard de address |
| trace_transaction | chain_id, tx_hash | CallFrame[] del tracer de llamadas fijo, client/version, trace_path, errors y cobertura; unsupported es unavailable, no lista vacía concluyente |
| search_protocol_docs | query: string 1–2000 caracteres, chain_id?: ChainId, protocol?: string, version?: string, top_k?: entero 1–10 | hits con chunk_id, document hash, excerpt/span, URI/título/versión/sección, score y compatibilidad; no hits→ok con [] y cobertura insuficiente |

get_contract obtiene código por eth_getCode y ABI del corpus aprobado, no descarga ABI de URLs sugeridas por el agente. Resolución de proxy, si está soportada por el adapter, sólo usa lecturas históricas explícitas. `get_contract_events` fija y verifica hashes de la ventana, informa reorg y no promete snapshot atómico si el proveedor no lo garantiza. La paginación no omite ni duplica registros bajo un snapshot estable; hash de manifest acompaña todas las páginas.

RPC permitido: eth_chainId, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getBlockByHash/Number, eth_getBalance, eth_getCode, eth_getLogs; eth_getStorageAt sólo para resolución histórica soportada de proxy. debug_traceTransaction únicamente si habilitado y con tracer fijo. No pass-through RPC ni eth_send*, personal_*, admin_*, firma o código de tracer enviado por usuario. eth_call y consultas arbitrarias de contratos quedan fuera de v1.

## Límites propuestos

RPC normal 10 s; trazas 20 s; deadline total 90 s por investigación, 24 llamadas de tools, 2 intentos totales por lectura transitoria, backoff dentro del deadline. Cada intento cuenta al presupuesto; reintentar nunca mezcla snapshots. Máximo respuesta 2 MiB, trace 10.000 frames y profundidad 64; exceso retorna partial con evidencia faltante. Raw oversized no se procesa sin límite. Máximo 2 llamadas concurrentes por run y 4 runs locales; demo ajustará cuota por identidad. Presupuesto de modelo 20.000 tokens de entrada + 4.000 salida por run y una revisión correctiva; agotamiento genera reporte inconcluso. Son defaults de diseño a calibrar por evals.

## Ejemplo conceptual (no fixture ni resultado real)

Una llamada trace_transaction para un proveedor sin tracing devuelve `status=unavailable`, `data=null`, `warnings=[UNSUPPORTED_CAPABILITY]`, `coverage.complete=false`. El analista puede describir receipt/logs, pero debe declarar desconocidas las llamadas internas. No se fabrica una traza a partir de nombres de eventos.
