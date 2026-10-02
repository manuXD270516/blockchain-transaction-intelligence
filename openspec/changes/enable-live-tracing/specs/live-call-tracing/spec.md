## ADDED Requirements

### Requirement: tracing live con proveedor aprobado

El sistema SHALL ejecutar trazas live sólo con un proveedor y una credencial aprobados por el usuario, configurados fuera del repositorio, y SHALL mantener `unavailable` mientras no exista esa configuración.

#### Scenario: sin proveedor aprobado
- **WHEN** no hay configuración local habilitada
- **THEN** `trace_transaction` en live devuelve `unavailable` con `UNSUPPORTED_CAPABILITY` y no hay tráfico de tracing

#### Scenario: smoke live
- **WHEN** el proveedor aprobado está configurado
- **THEN** una traza real de Sepolia se normaliza con `call-trace/1.0.0`, su raíz coincide con la transacción y el receipt, y la credencial no aparece en salida, logs ni evidencia
