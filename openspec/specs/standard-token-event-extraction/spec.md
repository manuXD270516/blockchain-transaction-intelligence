# standard-token-event-extraction Specification

## Purpose
Extract standard token events (ERC-20, ERC-721, ERC-1155) with strict layouts and bounded, exact transfer amounts, linking each one to its evidence and building the evidence-backed base graph through an offline CLI.

## Requirements

### Requirement: Strict standard event layouts
El extractor SHALL decodificar exclusivamente los layouts de design.md y preservar raw cuando la firma o forma no permita una interpretación soportada.
#### Scenario: Transfer compartido
- **WHEN** la firma Transfer no tiene forma canónica ERC-20 ni ERC-721
- **THEN** devuelve ambiguous y ninguna transferencia.
#### Scenario: Evento ajeno
- **WHEN** topic0 no corresponde a un evento soportado
- **THEN** conserva log como unknown sin inventar nombre/argumentos.

### Requirement: Bounded exact transfer extraction
El extractor SHALL conservar cantidades uint256 exactas, metadata desconocida y batch_index, sin expansión parcial silenciosa.
#### Scenario: Batch inválido
- **WHEN** offsets o longitudes de arrays son incoherentes
- **THEN** marca malformed y no emite transferencias de ese batch.
#### Scenario: Límite excedido
- **WHEN** un batch excede 1024 elementos
- **THEN** devuelve limit_exceeded con cobertura parcial y raw preservado.

### Requirement: Evidence and semantics
Cada evento/transferencia SHALL citar evidencia con transformación versionada y usar standard_candidate y event_reported, sin inferir balances ni conformidad.
#### Scenario: Contrato no conforme
- **WHEN** un contrato emite un log de forma compatible
- **THEN** se describe sólo lo reportado por el evento y no se declara token certificado ni saldo neto.
#### Scenario: Revert global con logs
- **WHEN** el receipt fallido contiene logs
- **THEN** se conserva evidencia como inconsistente y no se emiten transferencias.

### Requirement: Evidence-backed base graph and offline CLI
El grafo SHALL contener sólo relaciones observables/reportadas con evidencia, y el CLI fixture SHALL ejecutarse offline.
#### Scenario: Sin trazas
- **WHEN** se genera el grafo desde receipt
- **THEN** no se inventan aristas de llamadas internas ni orden causal completo.
