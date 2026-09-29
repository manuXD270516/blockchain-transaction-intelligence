## Why

Cada hito tiene su propio eval (retrieval, tool policy, revisión) y tests, pero no hay una suite única con denominadores explícitos, splits, gates de release ni comparación pareada. M9 consolida esas mediciones sin inventar métricas que el sistema aún no puede producir.

## What Changes

- Añadir golden versionado y escrito a mano desde el generador de fixtures: tuplas de reconstrucción, eventos, orden de logs, anomalías y contratos no identificables, con familia y split.
- Implementar un runner offline que verifica integridad de fixtures, mide reconstrucción/extracción/orden/anomalías/abstención contractual/latencia/cobertura en proceso y ejecuta los evals existentes de retrieval, tool policy y revisión.
- Reportar cada métrica con numerador, denominador y estado `measured|N/A|unavailable`; micro y por familia/split.
- Aplicar gates: los de seguridad bloquean release aunque el resto sea alto; los de calidad usan los umbrales de evaluation-strategy.md; métricas N/A no cuentan como éxito.
- Añadir comparación pareada de dos resultados sólo cuando fixtures, corpus y evals coinciden, y un dashboard HTML estático.

## Capabilities

### New Capabilities

- `evaluation-runner`: golden, runner consolidado, gates, comparación y dashboard.

### Modified Capabilities

Ninguna. Los evals M5–M7 se ejecutan sin cambios como sub-suites.

## Impact

Se añaden `src/evals`, `evals/golden`, una CLI `eval` y tests. Sin dependencias, red ni modelos: tokens de modelo se reportan `unavailable` porque la suite offline no usa provider.
