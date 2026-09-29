# Diseño M4

Usar el SDK oficial TypeScript v2 y MCP 2026-07-28 mediante `serveStdio`. El entrypoint no escribe en stdout fuera del protocolo. La lógica de tools vive en un dispatcher puro e inyectable para contract tests; el adapter live por defecto permanece fijado a Sepolia/PublicNode.

Registrar `get_transaction`, `get_receipt`, `get_block`, `get_wallet_balance`, `get_token_transfers`, `get_contract`, `get_contract_events`, `trace_transaction` y `search_protocol_docs`. Cada definición incluye `inputSchema`, `outputSchema`, `additionalProperties:false` y annotations read-only/no destructiva/idempotente. Los inputs on-chain requieren chain_id `11155111`; direcciones y hashes deben ser lowercase canónicos. BlockRef contiene exactamente hash, number decimal o tag latest|safe|finalized.

El envelope exitoso contiene schema_version, request_id, status, data, evidence_ids, snapshot, provenance, coverage, warnings y page. Los hashes de evidencia se derivan de evidencia raw existente; no se devuelve endpoint. `not_found` y `unavailable` no son errores de transporte. Errores operativos esperados devuelven `isError:true` y código estable sin reflejar input ni mensajes del proveedor.

En M4 `get_contract_events` acepta una ventana inclusiva máxima de 100 bloques y consulta cada bloque mediante referencias históricas verificadas; fusiona en orden blockNumber/transactionIndex/logIndex, limita la página a 100 y declara truncación. El cursor v1 es opaco, HMAC-SHA256, expira y queda ligado a tool/query/snapshot; el secreto se genera por proceso o se inyecta en tests. Nunca contiene secretos, pero no se considera cifrado.

`trace_transaction` devuelve unavailable/UNSUPPORTED_CAPABILITY y `search_protocol_docs` unavailable/CORPUS_NOT_CONFIGURED. `get_contract` retorna bytecode y su SHA-256, dejando ABI, source, proxy e implementation como desconocidos. Token transfers conserva `event_reported`, estándares candidatos y cobertura M3.

Presupuestos por llamada: máximo 100 bloques, 100 elementos por página, 2 MiB de resultado serializado. El adapter mantiene sus deadlines, retries y allowlist RPC. La frontera rechaza propiedades extra, números JS para cantidades on-chain, herramientas desconocidas y cadenas no habilitadas.

