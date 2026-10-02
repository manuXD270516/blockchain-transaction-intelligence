## ADDED Requirements

### Requirement: trazas conscientes de ejecución

El sistema SHALL normalizar trazas `callTracer` en frames con `trace_path`, tipo de llamada, dirección de contexto y de código, valor declarado, estado de revert propio y ancestral y evidencia content-addressed, y SHALL NOT convertir intentos revertidos en movimientos efectivos.

#### Scenario: subllamada fallida capturada
- **WHEN** una subllamada reporta error pero el receipt global reporta éxito
- **THEN** la salida mantiene `transaction_status=success`, marca el frame como reverted, lista su `trace_path` en `reverted_subcalls` y añade `SUBCALL_REVERTED_TRANSACTION_SUCCEEDED` sin marcar la transacción como fallida

#### Scenario: llamada bajo ancestro revertido
- **WHEN** un frame sin error propio desciende de un frame revertido
- **THEN** queda `ancestor_reverted=true`, `value_semantics=reverted_attempt` y `native_value_effective_wei=null`

#### Scenario: fallo sin razón disponible
- **WHEN** el receipt reporta status 0 y la traza no incluye `revertReason`
- **THEN** el fallo se reporta observado, `revert_reason` es null y se añade `REVERT_REASON_UNKNOWN`

#### Scenario: delegatecall con valor heredado
- **WHEN** un frame DELEGATECALL reporta `value`
- **THEN** conserva caller como dirección de contexto y target como dirección de código, y usa `value_semantics=not_a_transfer` sin valor efectivo

### Requirement: coherencia, integridad y límites de traza

El sistema SHALL rechazar trazas cuyo frame raíz o estado no coincidan con la transacción y el receipt, SHALL verificar checksums de fixtures de traza y SHALL truncar por frames y profundidad declarando cobertura parcial.

#### Scenario: raíz incoherente
- **WHEN** el frame raíz difiere de la transacción en from, to, value o input, o su error contradice el status del receipt
- **THEN** se devuelve `INCONSISTENT_TRACE` y no se produce salida

#### Scenario: schema desconocido
- **WHEN** un frame contiene un tipo o clave no reconocidos o campos mal formados
- **THEN** se devuelve `INVALID_TRACE`

#### Scenario: traza adulterada
- **WHEN** el archivo de traza no coincide con el checksum de su manifest
- **THEN** el loader falla con `INTEGRITY_MISMATCH`

#### Scenario: traza truncada
- **WHEN** la traza excede el límite de frames o de profundidad
- **THEN** se devuelven sólo los frames dentro del límite con cobertura `partial`, conteos de omitidos y `TRACE_TRUNCATED`, sin afirmar secuencia completa

### Requirement: integración opcional en grafo y MCP

El sistema SHALL mostrar aristas `internal_call` en la vista de grafo cuando se aporta una traza y SHALL exponerla en `trace_transaction` cuando el backend la soporte, manteniendo `unavailable` cuando no.

#### Scenario: grafo con traza
- **WHEN** se construye la vista con traza
- **THEN** declara `call_trace_available=true`, cada arista interna enlaza a la evidencia de su frame y su estado distingue executed de reverted

#### Scenario: grafo sin traza
- **WHEN** no se aporta traza
- **THEN** la vista es idéntica a la de M8

#### Scenario: MCP sin backend de trazas
- **WHEN** el backend no implementa trazas, como el adapter Sepolia
- **THEN** `trace_transaction` devuelve `unavailable` con `UNSUPPORTED_CAPABILITY`

#### Scenario: MCP con traza truncada
- **WHEN** el backend devuelve una traza que excede el límite de frames
- **THEN** `trace_transaction` devuelve `partial` con `truncated=true` y cobertura explícita
