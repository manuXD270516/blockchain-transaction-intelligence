## ADDED Requirements

### Requirement: Read-only testnet policy
El adapter SHALL usar sólo Sepolia y métodos/endpoint permitidos en design.md, validando parámetros antes de red y eth_chainId antes de adquirir datos.

#### Scenario: Intento mutante
- **WHEN** se solicita eth_sendRawTransaction o un método fuera de allowlist
- **THEN** retorna POLICY_DENIED sin invocar transporte.

#### Scenario: Red equivocada
- **WHEN** el proveedor devuelve chain_id de mainnet
- **THEN** retorna UNSUPPORTED_CHAIN y no consulta transacciones ni estado.

### Requirement: Consistent acquisition and explicit gaps
El adapter SHALL distinguir pending, not_found, unknown, success y reverted, verificar referencias cruzadas y detectar cambios de hash canónico, preservando evidencia de lecturas correctas.

#### Scenario: Reorg
- **WHEN** el bloque canónico por número difiere del snapshot adquirido
- **THEN** falla INCONSISTENT_SNAPSHOT sin mezclar snapshots ni presentar un reporte exitoso.

#### Scenario: Receipt ausente
- **WHEN** una transacción incluida tiene receipt null
- **THEN** devuelve partial/unknown con warning explícito.

#### Scenario: Sin traza
- **WHEN** una transacción falla y tracing no está soportado
- **THEN** informa reverted y causa desconocida, sin fabricar llamadas internas.

### Requirement: Pinned block reads
El adapter SHALL fijar el bloque de balance, código y logs, verificar canonicalidad y conservar valores enteros sin float.

#### Scenario: Saldo cero
- **WHEN** el proveedor devuelve 0x0 en un snapshot consistente
- **THEN** retorna cero como dato observado, distinto de error o estado podado.

#### Scenario: Estado podado
- **WHEN** el proveedor informa missing trie node o historical state unavailable
- **THEN** devuelve PRUNED_STATE seguro sin reemplazarlo por cero.

### Requirement: Bounded transport and provenance
El transporte SHALL aplicar límites de tiempo/bytes/intentos, validar envelopes JSON-RPC y conservar hashes de bytes de respuestas exitosas y journal redactado.

#### Scenario: Rate limit transitorio
- **WHEN** el proveedor responde HTTP 429
- **THEN** se permite un único reintento dentro del deadline y presupuesto, o retorna RATE_LIMITED.

#### Scenario: Respuesta malformada o excesiva
- **WHEN** falta result, no coincide id o body excede 2 MiB
- **THEN** falla con código seguro sin exponer mensajes del proveedor ni consumir memoria sin límite.

### Requirement: Offline equivalence and regression
FixtureAdapter SHALL implementar la misma investigación de sólo lectura usando fixtures verificados, sin red; la suite RPC SHALL usar escenarios sintéticos reproducibles.

#### Scenario: Replay fixture
- **WHEN** se usa FixtureAdapter con escenario M0
- **THEN** coincide el estado observado con replay y conserva procedencia synthetic.
