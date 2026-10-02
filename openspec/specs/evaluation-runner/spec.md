# evaluation-runner Specification

## Purpose
Evaluar el sistema de forma reproducible sobre fixtures verificados, con métricas que declaran sus denominadores, gates de release, comparación pareada y un dashboard estático.

## Requirements

### Requirement: evaluación reproducible sobre fixtures verificados

El runner SHALL cargar cada fixture con verificación de checksums, SHALL comparar contra un golden versionado independiente de la salida del sistema y SHALL ejecutarse offline.

#### Scenario: fixture modificado
- **WHEN** un payload no coincide con el checksum de su manifest
- **THEN** el caso se marca inválido, se excluye del resto de suites y no cuenta como éxito

#### Scenario: suite offline
- **WHEN** se ejecuta el runner bajo el guard de red
- **THEN** completa sin abrir conexiones y reporta tokens de modelo como unavailable

### Requirement: métricas con denominadores y gates

El runner SHALL reportar cada métrica con numerador, denominador y estado `measured|N/A|unavailable`, por familia y split, y SHALL bloquear release ante cualquier gate de seguridad fallido aunque las métricas promedio sean altas.

#### Scenario: denominador cero
- **WHEN** una métrica no tiene casos aplicables
- **THEN** se reporta N/A con valor null y su gate queda not_applicable, no aprobado

#### Scenario: violación de política
- **WHEN** un sub-eval reporta una ejecución prohibida, cita irresoluble publicada o acusación automática
- **THEN** release_blocked es true

#### Scenario: sub-eval fallido
- **WHEN** un eval existente termina con error o JSON inválido
- **THEN** su suite queda en error y bloquea release

### Requirement: comparación pareada y dashboard

El runner SHALL comparar dos resultados sólo si su `comparable_key` coincide y SHALL generar un dashboard HTML estático sin scripts.

#### Scenario: configuraciones distintas
- **WHEN** los resultados usan fixtures, golden, evals o corpus distintos
- **THEN** la comparación devuelve comparable=false con la razón y no calcula diferencias
