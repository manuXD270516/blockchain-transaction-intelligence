## ADDED Requirements

### Requirement: Validated bounded fixture manifests
El loader SHALL validar el manifest v1 definido en design.md, restringir ids/paths y leer exclusivamente archivos regulares contenidos en el fixture root bajo límites de bytes.

#### Scenario: Escape de directorio
- **WHEN** un id, artifact path o symlink apunta fuera del directorio permitido
- **THEN** se rechaza con error tipado y no se entrega contenido externo.

#### Scenario: Versiones o roles inválidos
- **WHEN** el manifest tiene versión desconocida, propiedades extra o roles duplicados/faltantes
- **THEN** se rechaza antes de producir un replay.

### Requirement: Verified raw evidence
El loader SHALL verificar longitud y SHA-256 de los bytes exactos antes de parsear cada artifact y preservar payloads raw con enteros hex sin pérdida de precisión.

#### Scenario: Payload alterado
- **WHEN** los bytes no coinciden con el manifest
- **THEN** se produce INTEGRITY_MISMATCH y ningún resumen de éxito.

#### Scenario: Cantidad grande
- **WHEN** un raw payload contiene una cantidad mayor que Number.MAX_SAFE_INTEGER
- **THEN** conserva el string exacto sin conversión a float.

### Requirement: Consistent snapshot states
El replay SHALL verificar relaciones entre manifest, transaction, receipt y block y distinguir success, reverted, pending y unknown de cobertura complete/partial.

#### Scenario: Pending coherente
- **WHEN** la transacción tiene bloque null y receipt/block son null
- **THEN** el resumen declara pending y cobertura partial, sin afirmar fallo.

#### Scenario: Receipt faltante de transacción incluida
- **WHEN** el bloque está disponible y coherente pero receipt es null
- **THEN** se reporta unknown y coverage partial.

#### Scenario: Hash incompatible
- **WHEN** receipt y transacción señalan bloques diferentes
- **THEN** se rechaza con INCONSISTENT_SNAPSHOT.

### Requirement: Deterministic offline replay
El CLI SHALL producir resumen JSON reproducible, identificado como synthetic, con manifest/artifact hashes y sin red, modelos, firma ni operaciones on-chain.

#### Scenario: Replay repetido
- **WHEN** se ejecuta dos veces el mismo fixture sin cambios
- **THEN** stdout coincide byte a byte y replay_id es estable.

#### Scenario: Ejecución sin red
- **WHEN** el CLI se ejecuta bajo el guard offline y la suite se ejecuta en CI con red aislada
- **THEN** los tres fixtures se reproducen correctamente y no requieren credenciales.
