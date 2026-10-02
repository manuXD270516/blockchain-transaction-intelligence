## ADDED Requirements

### Requirement: lectura histórica del slot de proxy

El adapter SHALL leer `eth_getStorageAt` únicamente para el slot EIP-1967 de implementación en un bloque fijado y SHALL rechazar cualquier otro slot antes de la red.

#### Scenario: otro slot
- **WHEN** se solicita `eth_getStorageAt` con un slot distinto
- **THEN** la política devuelve `POLICY_DENIED` sin llamar al transporte

### Requirement: tracing live deshabilitado por defecto

El sistema SHALL ofrecer un backend de tracing live con tracer fijo `callTracer`, host HTTPS configurado por administrador y límites propios, SHALL estar deshabilitado salvo configuración explícita y SHALL no formar parte de la allowlist RPC principal.

#### Scenario: configuración ausente o deshabilitada
- **WHEN** no hay configuración o `enabled` no es `true`
- **THEN** la creación falla con `LIVE_TRACING_DISABLED` sin tráfico de red

#### Scenario: petición fija
- **WHEN** el backend está habilitado con transporte simulado
- **THEN** envía exactamente `debug_traceTransaction` con el hash y `{"tracer":"callTracer"}`, y un proveedor sin el método produce `UNSUPPORTED_CAPABILITY`
