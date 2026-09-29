# M1 — Ethereum read-only adapter

Red: Sepolia, chain_id 11155111 (0xaa36a7). Proveedor integrado: PublicNode, endpoint fijo HTTPS `ethereum-sepolia-rpc.publicnode.com`. Selección fundamentada en [Ethereum networks](https://ethereum.org/developers/docs/networks/) y [PublicNode](https://www.publicnode.com/), consultados 2026-09-24. No promesa de disponibilidad del proveedor. No mainnet ni URL arbitraria en CLI/tools.

## Contrato

ChainAdapter expone `investigate(txHash)`: schema_version, mode, chain_id, status ok|partial|not_found, execution_status success|reverted|pending|unknown, snapshot|null, raw transaction/receipt/block, capabilities, evidence[], warnings. FixtureAdapter usa manifest verificado M0 y mantiene modo synthetic. EthereumAdapter agrega además getBlock(BlockRef), getBalance(address,BlockRef), getCode(address,BlockRef), getLogs(address,BlockRef). BlockRef es objeto cerrado con exactamente hash, number decimal o tag latest|safe|finalized. Logs se restringen a un único blockHash en M1; rangos/paginación se incorporarán antes de exponer MCP M4.

No se llama a este resultado reporte revisado. Se mantienen cantidades raw hex, direcciones lowercase (mixed-case se rechaza en este contrato interno M1), logs sin decodificar y ninguna inferencia. Métodos adicionales devuelven data, snapshot y evidence. getCode no identifica ABI/protocolo/proxy. getBalance sólo devuelve wei nativo.

## Consistencia

Cada operación crea una sesión y verifica eth_chainId primero. Investigación: tx→receipt→bloque por hash→relectura canónica por número. Validar hash solicitado, chain si viene en tx, blockNumber, transactionHash y pertenencia al bloque; logs de receipt se validan contra el snapshot y tx. Reorg produce INCONSISTENT_SNAPSHOT, no merge/retry automático de snapshots. Pending sólo con tx no incluida y receipt null. Tx null→not_found; receipt null de tx incluida→partial/unknown; bloque ausente→partial con snapshot no confirmado, sin aceptar evidencia como conjunto completo.

Lecturas de estado resuelven BlockRef una vez y usan número fijado con validación canónica de hash antes/después (fallback compatible con proveedores sin EIP-1898). Logs usan blockHash y se verifican contra dirección/snapshot; revalidar canonicalidad al final. No garantiza atomicidad contra proveedor mentiroso ni un reorg que ocurra y se revierta entre lecturas. Finality será unknown salvo tag safe/finalized explícitamente consultado; sigue siendo una declaración del proveedor.

## Transporte y política

Allowlist cerrada de ocho métodos: eth_chainId, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getBlockByHash, eth_getBlockByNumber, eth_getBalance, eth_getCode, eth_getLogs. Validación runtime de parámetros; no RPC pass-through CLI. Sin eth_call, debug, signing ni send. Tracing, ABI y archive state se anuncian unsupported/unknown, nunca probados por ausencia de error. safe/finalized se intenta sólo bajo solicitud; -32601 se informa UNSUPPORTED_CAPABILITY, nunca fallback silencioso a latest.

HTTPS fijo sin redirects, credenciales ni overrides por input. Resolver únicamente IPv4 público, rechazar rangos privados/reservados, fijar dirección resuelta al conectar y conservar validación TLS del hostname. Test injection de transporte se limita a API interna de desarrollador, no input de usuarios. No ejecutar contenido del proveedor.

Cada sesión: timeout por intento 10 s, deadline 90 s, 24 intentos RPC globales, 2 intentos por lectura transitoria, backoff 100 ms dentro del deadline. Abort cubre DNS, conexión y body; límite body 2 MiB independiente de Content-Length. No concurrencia interna; sesión no compartida entre investigaciones. Errores de tamaño fallan cerrados (SIZE_LIMIT), sin devolver JSON truncado. Errores: POLICY_DENIED, INVALID_INPUT, UNSUPPORTED_CHAIN, PROVIDER_ERROR, RATE_LIMITED, TIMEOUT, BUDGET_EXCEEDED, UNSUPPORTED_CAPABILITY, PRUNED_STATE, INCONSISTENT_SNAPSHOT, SIZE_LIMIT. Pruned se clasifica mediante mensajes conocidos del proveedor y se trata como indicación, no prueba universal de ausencia; errores desconocidos permanecen PROVIDER_ERROR. No repetir input inválido, mismatch, reorg o pruning.

Evidence por lectura exitosa: response bytes UTF-8, SHA-256, método/params, request id, captured_at y provider id lógico. Errores remotos no se imprimen; guardar sólo código seguro en journal de intentos, duración y total de solicitudes. Salida evidence no contiene configuración de endpoint. Hash acredita integridad de captura, no autenticidad criptográfica de blockchain. Persistencia content-addressed y claims se reservan a hitos posteriores.

## Verificación

Tests con respuestas RPC sintéticas en archivos, nunca hashes presentados como capturas reales. Probar políticas antes de red, timeout/abort, límites, envelope/id/result-error, cuotas, retry, estados parciales, reorg, pruned, balance cero y logs inconsistentes. Verificar adapter fixture conserva comportamiento M0. CI sigue sin conectividad. Smoke live opt-in lee bloque finalized de Sepolia y registra sólo hash/número/chain; ninguna escritura.
