## ADDED Requirements

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
