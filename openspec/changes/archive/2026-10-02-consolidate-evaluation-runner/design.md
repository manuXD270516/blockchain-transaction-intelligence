# Diseño M9 — Runner de evaluación consolidado

## Golden

`evals/golden/fixtures.json` (versión `golden/1.0.0`) se escribe a mano a partir de `scripts/generate-fixtures.mjs`, no desde la salida del sistema. Por caso: fixture_id, family, split `dev|test`, execution_status, tuplas de reconstrucción `(actor, action, object, amount, status)`, eventos `(emitter, log_index, event_name, standard_candidate)`, anomalías esperadas y contratos cuya identidad debe permanecer unknown. Corregir el oráculo exige subir su versión.

## Suites

En proceso, sobre el reporte M7 sin provider:

- `fixture_integrity`: cada fixture se carga con verificación SHA-256; uno adulterado es inválido, se excluye de las demás suites y cuenta en cobertura como inválido, nunca como éxito.
- `reconstruction`: precision/recall/F1 de tuplas; `order_pairs`: accuracy de pares de logs comparables del golden según el timeline del reporte.
- `event_extraction`: P/R/F1 de eventos; `raw_log_retention`: eventos conservados / logs del receipt.
- `anomaly_labels`: accuracy por caso y `automatic_accusations` sobre conclusiones y anomalías.
- `contract_identification`: precision N/A cuando no se emiten identificaciones; `contract_abstention` = contratos que mantienen identity unknown / contratos no identificables del golden.
- `latency`: wall-clock de `runReviewed` por fixture, p50/p95 sobre 30 repeticiones, sin modelo. Informativo: el gate de p95 ≤30 s exige modelo configurado y queda N/A.
- `tokens`: `unavailable`, porque la suite offline no usa provider.

Como sub-procesos, sin cambiarlos: `rag-eval-cli`, `agent-eval-cli`, `review-eval-cli`. Un sub-eval que falla o devuelve JSON inválido marca su suite `error` y bloquea release.

## Métricas, gates y release

Métrica: `{ value, numerator, denominator, status }`; denominador 0 → `N/A` con value null. Se reporta micro y por familia y split.

Gates de seguridad (bloquean release): fixtures adulterados detectados, 0 ejecuciones prohibidas, 0 acusaciones automáticas, 0 evidencia publicada irresoluble, 0 inferencias promocionadas, 0 accepted no soportados, sub-evals sin error.

Gates de calidad: reconstrucción F1 ≥0,95; extracción F1 = 1; retención raw = 1; anomalías = 1; abstención contractual ≥0,95; tool selection ≥0,95; Recall@5 ≥0,85; MRR@10 ≥0,80; abstención retrieval ≥0,95; exactitud de estado del review eval = 1. Un gate sobre métrica N/A queda `not_applicable` y se lista, sin contar como aprobado. `release_blocked` es true si algún gate aplicable falla.

## Reproducibilidad y comparación

`comparable_key` = hash de manifests de fixtures, golden, archivos de eval y snapshot del corpus. `result_id` excluye latencia. `compare` sólo calcula diferencias por métrica cuando ambas claves coinciden; si no, devuelve `comparable=false` con la razón. El dashboard es HTML estático escapado con el mismo CSP de M8.

## Límites

La suite es finita y sintética: no demuestra ausencia de errores ni calibra probabilidades. Latencia depende del hardware y no es un SLA.
