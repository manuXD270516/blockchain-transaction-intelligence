## Why

Explicar una transacción requiere conciliar datos de ejecución y documentación heterogénea. Una narrativa plausible sin procedencia puede confundir eventos con movimientos efectivos, fallos con causas comprobadas y patrones con intención. Necesitamos contratos verificables antes de implementar agentes.

## What Changes

- Definir alcance EVM de solo lectura, threat model, dominio y arquitectura.
- Diseñar nueve tools de `blockchain-mcp-server`, evidencia, límites de agentes y RAG citado.
- Especificar clasificación de anomalías, grafo, evaluación reproducible y observabilidad.
- Planificar M0–M11 con criterios de salida. Entregar exclusivamente documentación.

## Capabilities

### New Capabilities

- `read-only-chain-data`: adapters, cobertura y snapshots consistentes.
- `transaction-normalization`: representación canónica y extracción de eventos/tokens.
- `blockchain-mcp`: contratos acotados y enforcement de solo lectura.
- `evidence-claims`: procedencia, clasificación y revisión de afirmaciones.
- `protocol-rag`: corpus versionado, recuperación y citas verificables.
- `bounded-agents`: responsabilidades, presupuestos y abstención.
- `transaction-graph`: relaciones con evidencia y límites de cobertura.
- `evaluation-observability`: fixtures, métricas, gates y trazabilidad.

### Modified Capabilities

Ninguna; proyecto nuevo.

## Impact

Se crea un directorio independiente sin modificar los otros proyectos. La futura aplicación incorporará adapters, normalización, MCP, corpus y orquestación. No se instalan dependencias, llaman modelos ni descargan datasets en este change. Los objetivos de rendimiento y calidad son metas propuestas, no resultados medidos.

Fuera de alcance: trading, asesoramiento de inversión, custodia, firma, movimientos de fondos, atribución de personas, scoring de fraude, vigilancia masiva de wallets, indexador global y soporte universal de cadenas EVM.
