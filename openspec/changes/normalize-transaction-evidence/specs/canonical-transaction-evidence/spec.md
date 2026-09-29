## ADDED Requirements

### Requirement: Exact canonical quantities and raw retention
El normalizador SHALL implementar design.md sin float, conservar raw completo y distinguir null/zero/invalid y tipos desconocidos.

#### Scenario: uint256 máximo
- **WHEN** value contiene el máximo uint256
- **THEN** value_wei contiene su decimal exacto y raw conserva hex sin mutación.

#### Scenario: Creación y tipo nuevo
- **WHEN** to es null y type no está reconocido
- **THEN** conserva creación, tipo decimal y raw, emite warning y no inventa contrato destino.

### Requirement: Evidence-backed deterministic derivations
Cada entidad y fee derivada SHALL enlazar fuentes verificadas y JSON Pointers mediante un DAG content-addressed, preservando bytes y contexto de captura.

#### Scenario: Raw sin soporte o evidencia manipulada
- **WHEN** el raw no corresponde a una fuente o su checksum falla
- **THEN** se rechaza sin emitir bundle válido.

#### Scenario: Repetición
- **WHEN** se normaliza dos veces la misma entrada
- **THEN** bundle_id, evidence_ids y contenido JSON son idénticos.

### Requirement: Snapshot and execution consistency
El normalizador SHALL revalidar snapshots/estado/logs y separar adquisición, ejecución y cobertura.

#### Scenario: Receipt ausente
- **WHEN** tx incluida tiene receipt null
- **THEN** execution_status es unknown y coverage partial, sin afirmar fallo.

#### Scenario: Snapshot mezclado
- **WHEN** receipt/log/block o snapshot indican otra transacción/bloque
- **THEN** falla INCONSISTENT_NORMALIZATION_SNAPSHOT.

### Requirement: Conservative fee accounting
El normalizador SHALL derivar fees de campos suficientes y mantener total null cuando faltan componentes o semántica del tipo.

#### Scenario: Precio efectivo ausente
- **WHEN** existe gasUsed pero no effectiveGasPrice
- **THEN** execution_fee_wei y total_fee_wei quedan null, aunque exista maxFeePerGas.

#### Scenario: Blob fee
- **WHEN** una transacción tipo 3 aporta todos los campos de execution y blob
- **THEN** calcula ambas componentes y total exactos con evidencia de cada input.

### Requirement: Offline CLI and scope boundary
El CLI SHALL normalizar fixtures sin red y no decodificar eventos, inferir intención ni presentar el bundle como reporte revisado.

#### Scenario: Fixture offline
- **WHEN** se ejecuta normalize fixture bajo guard offline
- **THEN** produce bundle synthetic y no importa módulos RPC de red.
