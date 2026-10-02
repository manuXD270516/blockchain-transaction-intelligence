# transaction-normalization Specification

## Purpose
Normalize transactions into a lossless canonical model with evidence-backed event and transfer extraction and execution-aware call traces.

## Requirements

### Requirement: Lossless canonical model
El sistema SHALL normalizar según design.md usando enteros como strings, identidad chain-qualified, schema_version, referencias raw y estados desconocidos explícitos.

#### Scenario: Cantidad grande y metadatos ausentes
- **WHEN** un token tiene valor uint256 y no se conocen decimals
- **THEN** se conserva el entero exacto, decimals queda null y se muestra cantidad raw sin asumir 18.

#### Scenario: Tipo nuevo o creación
- **WHEN** una transacción tiene campos no reconocidos o to=null
- **THEN** se conservan campos raw y se identifica creación sin inventar dirección destino ni descartar el registro.

### Requirement: Evidence-backed event and transfer extraction
El sistema SHALL conservar logs raw, separar decodificación de observación y representar ERC-20/721/1155 como transferencias event_reported con evidencia y estándar justificable.

#### Scenario: Firma Transfer ambigua
- **WHEN** topics/data y ABI no permiten distinguir de forma suficiente el estándar
- **THEN** se preserva el log como ambiguo y no se afirma token fungible, NFT ni saldo neto.

#### Scenario: Batch o payload malformado
- **WHEN** un evento ERC-1155 contiene arrays ids/values de longitudes distintas
- **THEN** falla la decodificación con motivo, conserva raw y no produce transferencias parciales silenciosas.

### Requirement: Execution-aware traces
El sistema SHALL conservar trace_path, contexto de ejecución y estado de revert propio y ancestral, sin convertir intentos revertidos en movimientos efectivos.

#### Scenario: Subllamada fallida capturada
- **WHEN** una subllamada falla pero el receipt global reporta éxito
- **THEN** el reporte diferencia ambos estados y no marca toda la transacción como fallida.

#### Scenario: Fallo sin razón disponible
- **WHEN** status=0 y no hay evidencia de revert reason
- **THEN** el fallo se reporta observado y su causa queda desconocida.
