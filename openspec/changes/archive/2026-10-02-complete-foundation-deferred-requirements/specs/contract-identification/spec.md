## ADDED Requirements

### Requirement: identidad de contrato por bloque con procedencia

El sistema SHALL identificar contrato, proxy EIP-1967 e implementación sólo con lecturas del bloque del caso y un registro local de ABI con procedencia por code hash, y SHALL mantener la identidad `unknown` cuando falte prueba histórica.

#### Scenario: proxy con implementación registrada
- **WHEN** el slot EIP-1967 apunta a una implementación cuyo code hash está en el registro
- **THEN** se devuelve proxy `eip1967`, implementación, identidad con nombre, versión, `abi_sha256` y procedencia, y evidencia de cada lectura

#### Scenario: proxy actualizado sin ABI histórica
- **WHEN** en el bloque del caso la implementación tiene un code hash no registrado
- **THEN** la identidad queda `unknown` con `NO_HISTORICAL_ABI` y no se usa la ABI de otra implementación

#### Scenario: slot malformado o no leído
- **WHEN** el slot no es una dirección con 12 bytes altos en cero o no está disponible
- **THEN** el proxy queda `unknown` y no se afirma ausencia de proxy

#### Scenario: fixture adulterado
- **WHEN** el estado del fixture no coincide con su checksum
- **THEN** la carga falla con `INTEGRITY_MISMATCH`
