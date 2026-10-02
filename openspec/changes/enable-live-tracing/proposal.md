## Why

`complete-foundation-deferred-requirements` deja listo un backend de tracing live (`debug_traceTransaction` con `callTracer`), deshabilitado por defecto. Ejecutarlo requiere un proveedor RPC de Sepolia que exponga métodos `debug_*`. El endpoint público PublicNode usado en M1 no los ofrece, y los proveedores que sí lo hacen suelen exigir cuenta de pago o API key. Este change agrupa lo que falta para habilitarlo y no autoriza gasto ni credenciales por sí mismo.

Estado: **configuración lista, ejecución pendiente de proveedor**.

## What Changes

- Elegir un proveedor con `debug_traceTransaction` y `callTracer` en Sepolia, con plan y política de datos aceptados por el usuario.
- Gestionar la credencial fuera del repositorio (variable de entorno o secreto de CI). No se versiona ninguna clave, y la redacción M10 debe cubrir el formato del proveedor.
- Habilitar `enabled: true` en una configuración local no versionada y conectar `LiveTraceBackend` al servidor MCP y al CLI live.
- Ejecutar un smoke live con un hash real de Sepolia y registrar el resultado.

## Capabilities

### New Capabilities

- `live-call-tracing`: ejecución real de trazas live con proveedor aprobado.

### Modified Capabilities

Ninguna.

## Impact

Puede requerir una cuenta de pago o API key del usuario. Hasta entonces, `trace_transaction` sigue `unavailable` con el adapter Sepolia y las trazas sólo se verifican offline.
