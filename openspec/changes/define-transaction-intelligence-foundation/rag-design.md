# Protocol RAG v1

## Corpus y confianza

Ingesta administrada de Ethereum docs, estándares, documentación de protocolos/contratos, patrones de seguridad y auditorías públicas con licencia/procedencia registrada. Fuentes iniciales candidatas: enlaces técnicos de design.md. Documentos de protocolos y auditorías se seleccionarán en M5 para contratos de fixtures concretos; no se declara ningún corpus ya cargado.

Cada Document lleva canonical_uri, publisher, title, protocol, chain/deployment addresses cuando se conocen, version/commit, published_at si existe, retrieved_at, license/access conditions, content_hash, parser_version y trust tier. Auditoría: añadir contrato/commit auditado, fecha y alcance; hallazgos pasados no prueban vulnerabilidad actual ni fraude. No afirmar seguridad por ausencia de hallazgos.

Pipeline: allowlist de fuente→descarga acotada→extracción sin ejecutar scripts→revisión de procedencia/compatibilidad→snapshot inmutable→chunking por secciones→índice léxico+vectorial. Conservar tabla/código con sección; tamaño objetivo 400–800 tokens, overlap máximo 100, ajustable y versionado. PDFs necesitan página y offsets del texto extraído; sin extracción verificable, no se usan como citas aceptadas.

Chunk: chunk_id, doc_hash/version, heading_path, offsets de caracteres en texto canónico, page?, exact excerpt, chunk_hash, embedding model/version/dimension y index_version. No reescribir una fuente in-place. Actualizar índice crea una versión; reportes previos siguen resolviendo su snapshot.

## Recuperación y citas

Consulta desde contexto mínimo del caso; filtrar protocolo/versión/deployment cuando se conocen. Ejecutar búsqueda léxica y vectorial, fusionar por ranking recíproco, devolver top_k≤10; reranker sólo si evals justifican su inclusión. Scores son rankings, no probabilidades de verdad.

Cada hit devuelve URI, título, versión/hash, sección/página, span exacto y compatibilidad (`matched|generic|unknown|conflicting`). El agente sólo usa `matched` o documentación genérica explícitamente aplicable para soporte técnico; docs de versión incompatible se pueden listar como conflicto, nunca como prueba silenciosa. Si falta identidad contractual, la recuperación puede explicar conceptos genéricos sin nombrar un protocolo como hecho.

Citación final: enlace a la URI real cuyo texto incluye título, versión y sección/página, más chunk_id y doc_hash en reporte estructurado. Validación: documento existe en manifest, hash y span coinciden, fragmento soporta proposición y versión aplica. Sin soporte: abstenerse o retirar claim. Los enlaces públicos pueden cambiar; el snapshot local permite replay.

Texto recuperado es contenido no confiable. Instrucciones dentro de docs no modifican system prompts, políticas, permisos ni destinos de red. No hacer browsing abierto como fallback; una consulta vacía devuelve cobertura insuficiente. Ni similarity alta ni una cita válida sustituyen la revisión de entailment.

## Criterios de salida M5

Corpus pequeño, curado y licenciado, al menos dos versiones incompatibles para probar filtros y una auditoría con alcance explícito. Queries positivas, negativas, sin respuesta y de prompt injection con qrels humanos. Reproducir resultados con manifest fijado; medir Recall@5, MRR@10, citas válidas, soporte semántico y abstención según evaluation-strategy.md.
