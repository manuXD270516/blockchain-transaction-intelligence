# M3 — Eventos estándar y transferencias reportadas

Prerrequisito solicitado: Graphify instalado y consultas CLI/MCP verificadas en enable-local-graphify. Usar grafo para navegación de código, nunca como evidencia blockchain.

## Contrato

`extractTokenEvents(Investigation)` normaliza primero mediante M2. Devuelve bundle inmutable con normalizado autocontenido, extracción v1, events[], transfers[], derived_evidence[], graph, coverage, warnings y extraction_id hash determinístico. No admite un bundle canónico arbitrario sin verificar su origen. Mantener raw por medio del normalizado. Sin modelos ni red interna.

Por log: id, log_id, emitter, signature/topic0, status decoded|unknown|ambiguous|malformed|inconsistent|limit_exceeded, standard_candidate|null, event_name|null, arguments|null, reason|null, evidence_ids y raw_log (topics/data/dirección/índices). Firma Transfer compartida: 3 topics + 32 bytes data→layout ERC-20; 4 topics + data vacío→ERC-721; forma diferente→ambiguous sin transferencias. Padding de address distinto de 12 bytes cero→malformed. La etiqueta estándar es candidato por layout, no contrato verificado; cualquier código puede emitir un evento compatible.

ERC-1155 usa 4 topics: firma, operator, from, to; Single data de 2 words (id,value). Batch data con dos arrays uint256 en ABI canónica: offsets 64 y 96+32*n, longitudes iguales, sin solapamiento ni trailing bytes; arrays vacíos válidos. Validar límites antes de asignar arrays o convertir longitudes a Number. Límite por log 128 KiB y 1024 items por batch; máximo 10000 logs procesados y 10000 transfers por run. Un log o lote que exceda su límite emite `limit_exceeded`; los logs que superen el límite global permanecen en el normalizado y se contabilizan como `omitted_logs` con cobertura parcial y warning, sin truncamiento silencioso. No expandir parte de un batch. Contar cobertura en base a logs totales, procesados, omitidos, decodificados, desconocidos y rechazados; separar receipt_missing de receipt vacío confirmado.

Transfer: id chain/tx/block/log_index/batch_index, token_address, standard_candidate, operator|null, from, to, token_id|null, raw_amount decimal (ERC-721 usa 1), decimals=null, symbol=null, semantics=event_reported, evidence_ids. No inferir balances, precios, intención ni metadata. Dirección cero se conserva sin concluir automáticamente mint/burn; amount cero y token_id cero son válidos.

Receipt global reverted con logs es inconsistente: conservar logs pero no decodificar como transferencia reportada de estado confirmado. Receipt vacío de revert no es error; causa sigue desconocida. No se incorporan logs de trazas ni intentos revertidos.

## Evidencia y grafo

Cada evento decodificado produce nodo derived con parent normalizado del log, inputs mediante JSON Pointers, transformation/version y referencia al estándar EIP aplicable. Cada transferencia produce otro nodo con parent evento y batch_index. Cada id se calcula sobre contenido/contexto inmutable; normalizado permanece como raíz verificable. Unknown/malformed conserva cita al log y reason, sin inventar decodificación.

Grafo base: nodos transaction, address y contract-emitter con identidad chain-qualified; aristas emits (tx→emisor) y token_transfer_reported (from→to), citadas a evento/transferencia. No causalidad de llamadas ni ownership humano. Cobertura refleja límites/rechazos; M8 agregará UI. No confundir este grafo con Graphify de tooling.

CLI `node dist/extract-cli.js fixture <id>` offline; `... live <tx-hash>` import dinámico del adapter. Usar shared loader de investigación para no duplicar configuración entre normalize/extract CLIs. Demo fixture synthetic-token-events contiene ERC-20/721/1155 single/batch y desconocido, no transacciones públicas. Metadatos no se consultan.

Fixtures/golden independientes del código de decodificación; tests verifican firmas con Keccak (no SHA3-256), padding, uint256, cero, arrays vacíos, offsets, longitudes, límites, logs desconocidos/ambiguos, orden, IDs determinísticos, evidencia y ausencia de fondos/RPC en fixture. No se pretende un decoder genérico de ABI.

Fuentes normativas: [ERC-20](https://eips.ethereum.org/EIPS/eip-20), [ERC-721](https://eips.ethereum.org/EIPS/eip-721), [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155). Consultadas para layouts de eventos; no corpus RAG ingerido.
