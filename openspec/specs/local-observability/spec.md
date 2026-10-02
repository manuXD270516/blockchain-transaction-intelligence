# local-observability Specification

## Purpose
Observar cada run localmente con una traza correlacionada, redacción de secretos, exportación OTLP-JSON a disco y retención y borrado controlados de runs locales, sin servicios externos.

## Requirements

### Requirement: traza correlacionada por run

El sistema SHALL producir, cuando se inyecta un tracer, una traza con un único `trace_id` cuyos spans cubren run, análisis, llamadas de modelo, tools, revisión y llamadas de revisión, con versiones, budgets, estados y códigos de error, sin prompts crudos ni pregunta en claro, y SHALL mantener el reporte idéntico con o sin tracer.

#### Scenario: run revisado con provider
- **WHEN** se ejecuta `runReviewed` con provider guionado, tools y tracer
- **THEN** todos los spans comparten el `trace_id`, cada span no raíz tiene un parent existente y la raíz registra estado del reporte, budgets y versiones

#### Scenario: reporte sin cambios
- **WHEN** se ejecuta el mismo run con y sin tracer
- **THEN** los reportes son iguales

#### Scenario: fallo en una fase
- **WHEN** una llamada de modelo lanza un error
- **THEN** su span queda en `error` con código y mensaje redactado, y el contador del código aumenta

### Requirement: redacción de secretos

El sistema SHALL redactar credenciales en atributos de telemetría, errores y registros persistidos, conservando códigos y contexto útil, y SHALL no alterar hashes ni direcciones públicas.

#### Scenario: error con credencial
- **WHEN** un proveedor lanza un error con endpoint con token, userinfo o header Bearer
- **THEN** la traza y el registro persistido conservan el código y el host con las credenciales como `[REDACTED]`

#### Scenario: datos públicos
- **WHEN** se redacta un reporte de fixture con hashes de 64 hex, direcciones y claves como `token_address`
- **THEN** el resultado es idéntico a la entrada

### Requirement: exportación OTLP-JSON local

El sistema SHALL exportar la traza como OTLP-JSON sin abrir conexiones.

#### Scenario: exportación offline
- **WHEN** el CLI de trazas se ejecuta bajo el guard de red con `--otlp`
- **THEN** emite `resourceSpans` con ids hex válidos y termina sin conexiones

### Requirement: retención y borrado de runs locales

El sistema SHALL guardar runs sólo en una raíz segura, con ids hex, retención declarada (30 días local, 24 h demo), y SHALL permitir listar, leer, borrar y barrer expirados sin afectar fixtures ni corpus públicos.

#### Scenario: retención expirada
- **WHEN** vence el plazo de un run efímero de demo y se ejecuta el barrido
- **THEN** se elimina el directorio del run y los fixtures públicos quedan intactos

#### Scenario: raíz insegura
- **WHEN** se configura la raíz del store dentro de fixtures o corpus, o en la raíz del proyecto
- **THEN** el store rechaza la configuración con `UNSAFE_STORE_ROOT`

#### Scenario: id malicioso
- **WHEN** se pide leer o borrar un id con separadores de ruta o no hex
- **THEN** se rechaza con `INVALID_RUN_ID` sin tocar el disco

### Requirement: cuotas por identidad

El sistema SHALL ofrecer cuotas por identidad con ventana fija, límite de runs y de concurrencia, SHALL almacenar sólo el hash de la identidad y SHALL rechazar con `RATE_LIMITED` antes de ejecutar trabajo.

#### Scenario: cuota agotada
- **WHEN** una identidad supera los runs permitidos en la ventana
- **THEN** el orquestador devuelve `RATE_LIMITED` con tiempo de espera y no ejecuta análisis ni tools

#### Scenario: identidad en telemetría o memoria
- **WHEN** se registra un uso de cuota
- **THEN** la identidad sólo se conserva como SHA-256

#### Scenario: cuota sin identidad
- **WHEN** se configura cuota y el run no declara identidad
- **THEN** se rechaza con `INVALID_INPUT`
