## ADDED Requirements

### Requirement: reporte revisado con trazas opcionales

El sistema SHALL aceptar una traza `call-trace/1.0.0` de la misma investigación, SHALL publicar claims OBSERVED que distingan subllamadas revertidas del estado del receipt citando la evidencia de cada frame, y SHALL producir el mismo reporte que antes cuando no hay traza.

#### Scenario: subllamada revertida en transacción exitosa
- **WHEN** la traza reporta error en una subllamada y el receipt reporta éxito
- **THEN** el reporte publica un claim OBSERVED que cita el frame y el receipt, una anomalía `trace_reports_reverted_subcall`, y no marca la transacción como fallida

#### Scenario: traza de otra investigación
- **WHEN** la traza no corresponde a la transacción, cadena o `trace_id` recalculado
- **THEN** el run falla con `INCONSISTENT_TRACE` antes de analizar

#### Scenario: sin traza
- **WHEN** no se aporta traza
- **THEN** el reporte es idéntico al producido sin esta capacidad y declara llamadas internas no disponibles
