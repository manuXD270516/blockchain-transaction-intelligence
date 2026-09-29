## ADDED Requirements

### Requirement: Versioned tools contract
blockchain-mcp-server SHALL exponer get_transaction, get_receipt, get_block, get_wallet_balance, get_token_transfers, get_contract, get_contract_events, trace_transaction y search_protocol_docs conforme a mcp-contract.md, con schemas cerrados, structuredContent y errores tipados.

#### Scenario: Entrada extra o malformada
- **WHEN** una tool recibe una URL, método RPC arbitrario, hash inválido o propiedad no permitida
- **THEN** la validación rechaza el input sin invocar al proveedor.

#### Scenario: Saldo nativo cero
- **WHEN** get_wallet_balance recibe una respuesta válida con cero en el bloque solicitado
- **THEN** devuelve cero con snapshot y evidencia, distinguiéndolo de timeout o estado histórico no disponible.

### Requirement: Enforced limits and stable pagination
El servidor SHALL aplicar budgets, límites de rango/tamaño/tiempo y cursores ligados a consulta y snapshot; SHALL hacer cumplir permisos independientemente de annotations MCP.

#### Scenario: Respuesta truncada
- **WHEN** una traza excede el límite de frames o bytes
- **THEN** se devuelve partial con truncation y cobertura explícitas, sin afirmar secuencia completa.

#### Scenario: Cursor ajeno
- **WHEN** un cursor se reutiliza con otra cadena, filtro o snapshot
- **THEN** se devuelve INVALID_CURSOR y no se mezclan páginas.

#### Scenario: Páginas válidas
- **WHEN** se recorren páginas de una consulta bajo snapshot estable
- **THEN** el orden es determinístico y cada registro aparece exactamente una vez.
