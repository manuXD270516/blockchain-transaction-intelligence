# readonly-mcp-server Specification

## Purpose
Exponer las capacidades de análisis como un servidor MCP stdio de solo lectura con contrato cerrado, respuestas con evidencia y cobertura, enforcement de política independiente de las annotations, paginación ligada a la consulta y búsqueda documental local.

## Requirements

### Requirement: servidor MCP stdio con contrato cerrado
El sistema SHALL exponer las nueve tools definidas para M4 mediante stdio, schemas cerrados y annotations read-only, sin métodos de firma, envío o RPC pass-through.

#### Scenario: inventario de tools
- **WHEN** un cliente inicializa el servidor y solicita `tools/list`
- **THEN** recibe exactamente las nueve tools, con schemas y annotations de sólo lectura

### Requirement: respuestas con evidencia y cobertura
Cada resultado SHALL usar un envelope versionado con estado, evidencia, snapshot, procedencia, cobertura, warnings y paginación, y SHALL distinguir ausencia, indisponibilidad y error.

#### Scenario: receipt todavía no disponible
- **WHEN** una transacción incluida o pendiente no tiene receipt
- **THEN** `get_receipt` responde unavailable con cobertura incompleta y no afirma revert

#### Scenario: capacidades futuras
- **WHEN** se invoca tracing o búsqueda documental antes de sus hitos
- **THEN** la tool responde unavailable con warning explícito y datos null

### Requirement: enforcement independiente de annotations
El servidor SHALL validar chain, hashes, direcciones, BlockRef, rangos, páginas, cursores, tamaño de respuesta y allowlist en código antes de ejecutar backends.

#### Scenario: intento de ampliar autoridad
- **WHEN** el input contiene propiedades extra, cadena no soportada, referencia pending o parámetros ejecutables
- **THEN** se rechaza con INVALID_INPUT o UNSUPPORTED_CHAIN sin ejecutar RPC

### Requirement: paginación ligada a consulta
Los resultados paginados SHALL mantener orden determinístico y usar cursores autenticados, expirables y ligados a tool, consulta y snapshot.

`get_contract_events.data` SHALL ser un array de elementos `{raw, decoded}`. `raw` SHALL conservar cada log RPC completo y `decoded` SHALL mantener separada la interpretación estándar derivada.

#### Scenario: evento observado y decodificación derivada
- **WHEN** `get_contract_events` devuelve un log
- **THEN** el orden se determina por `raw.blockNumber`, `raw.transactionIndex` y `raw.logIndex`, y ningún campo derivado reemplaza al log raw

#### Scenario: cursor reutilizado en otra consulta
- **WHEN** un cursor válido se presenta con dirección, rango o transacción diferente
- **THEN** la llamada falla con INVALID_CURSOR y no mezcla resultados

### Requirement: pruebas de protocolo y política
La suite SHALL probar initialize, tools/list, tools/call, schemas, envelopes, errores, capacidades unavailable, límites, cursor adulterado y ausencia de llamadas mutantes.

#### Scenario: ejecución offline reproducible
- **WHEN** el cliente de contrato usa un servicio fixture bajo guard de red
- **THEN** las respuestas son determinísticas salvo request_id controlado y no intentan red

### Requirement: búsqueda documental local activada

`search_protocol_docs` SHALL consultar exclusivamente un corpus local aprobado y validado, mantener el input cerrado de M4 y devolver hits citables dentro del envelope MCP existente. Las otras tools y la autoridad read-only no SHALL cambiar.

#### Scenario: corpus disponible
- **WHEN** un cliente invoca `search_protocol_docs` y el snapshot local pasa integridad
- **THEN** recibe como máximo `top_k` hits ordenados con hashes, spans, compatibilidad e identidad del corpus

#### Scenario: corpus no configurado
- **WHEN** no existe un snapshot local válido
- **THEN** la tool conserva `unavailable`, datos null y warning `CORPUS_NOT_CONFIGURED`

#### Scenario: intento de browsing
- **WHEN** query, protocol o version contienen una URL o instrucciones para descargar otra fuente
- **THEN** se tratan como texto/filtros, no se realiza red y no se amplía la allowlist
