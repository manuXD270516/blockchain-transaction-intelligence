# Diseño M5 — Protocol RAG versionado

## Decisiones de corpus y confianza

La unidad publicable es un snapshot inmutable identificado por el SHA-256 de su manifest canónico. El manifest enumera documentos, chunks, índices y artefactos de embedding con sus hashes; una actualización siempre crea otro snapshot. El runtime rechaza rutas fuera del root, propiedades desconocidas, archivos faltantes, hashes distintos, versiones no soportadas y artefactos oversized antes de buscar.

El corpus inicial queda limitado a:

- EIP-20, EIP-721 y EIP-1155 desde `ethereum/EIPs`, fijados a un commit y registrados como CC0-1.0.
- Documentación y changelog de OpenZeppelin Contracts en tags `v4.9.4` y `v5.0.2`, registrados como MIT. Se conservan ambos para probar cambios incompatibles; nunca se selecciona `master` ni `latest`.
- La auditoría pública de OpenZeppelin Contracts v5.0.0, commit auditado `b5a3e69`, concluida en octubre de 2023, con auditor, alcance y condiciones de acceso explícitas. Si no hay permiso de redistribución comprobable, el texto no se commitea: la ingesta local conserva su hash y condiciones, y los tests usan un fixture sintético equivalente. La gate M5 exige una auditoría aceptada, no sólo un enlace.

Cada fuente necesita aprobación explícita en la allowlist y revisión de licencia/acceso. No hay crawling, descubrimiento por enlaces ni fallback a web. Redirecciones se limitan y vuelven a validar host, DNS y allowlist. Máximos iniciales: 128 documentos, 5 MiB por descarga, 64 MiB por snapshot canónico y 50.000 chunks. HTML se procesa sin scripts, estilos ni recursos remotos; Markdown conserva bloques y tablas; PDF exige página y offsets reproducibles o se excluye como fuente citable.

## Pipeline reproducible

Una CLI administrativa separa `fetch`, `build` y `verify`. `fetch` es la única fase con red y escribe staging; `build` sólo acepta bytes aprobados, normaliza texto, crea documentos/chunks e índices en un directorio nuevo; `verify` recalcula todo sin red. Ninguna fase sobrescribe un snapshot publicado. El servidor MCP abre artefactos read-only y nunca ejecuta ingesta.

`Document` incluye `document_id`, URI canónica, publisher, title, protocol, chain/deployments conocidos, versión/tag/commit, fecha publicada/obtenida, licencia/condiciones, content hash, parser/version, trust tier y, para auditorías, contrato/commit/fecha/alcance. Un `Chunk` incluye `chunk_id`, document hash/version, heading path, offsets sobre texto canónico, página opcional, excerpt exacto, chunk hash, parser/chunker version, modelo/revisión/dimensión e index version.

Chunking por sección apunta a 400–800 tokens con overlap máximo 100; código y tablas no se parten sin conservar heading y offsets. IDs y desempates se calculan de contenido canónico, nunca de timestamps. Fixtures y qrels no comparten lógica generadora con el buscador.

## Retrieval

El índice combina BM25 con vectores de `sentence-transformers/all-MiniLM-L6-v2` (384 dimensiones, mean pooling normalizado). Modelo ONNX, tokenizer y revisión exacta quedan fijados por hash en el manifest; runtime usa `local_files_only` y no llama APIs de modelos. Un modelo ausente o con hash incorrecto produce `CORPUS_NOT_CONFIGURED`, no descarga implícita.

Cada rama recupera candidatos acotados y se fusiona por reciprocal-rank fusion con `k=60`, pesos iguales y desempate por `chunk_id`. `top_k` permanece entre 1 y 10. Filtros de protocolo, versión y chain se aplican antes del ranking final. El score es ordinal, no probabilidad ni confianza factual.

Compatibilidad por hit: `matched`, `generic`, `unknown` o `conflicting`. Una versión explícita sólo puede producir soporte específico desde `matched`; hits `conflicting` pueden mostrarse para explicar el conflicto, pero no se promueven silenciosamente. Identidad de contrato desconocida permite únicamente contenido genérico.

## Contrato MCP, seguridad y degradación

`search_protocol_docs.data` es un array de hits con `chunk_id`, `document_hash`, excerpt/span exacto, URI, título, protocol, versión/commit, heading/página, score ordinal, compatibilidad, `index_version` y `corpus_snapshot_id`. El envelope M4 conserva `snapshot:null`; provenance usa el manifest hash y coverage declara filtros, ramas ejecutadas, truncación y faltantes. El texto MCP resume exactamente el structured content.

Sin hits relevantes responde `ok` con `data:[]`, cobertura incompleta y `NO_RELEVANT_DOCUMENTS`. Corpus/modelo ausente o inválido responde `unavailable` con `CORPUS_NOT_CONFIGURED`. Presupuesto o tamaño excedido usa los errores públicos M4. No se reflejan query completa, paths locales, contenido no seleccionado ni errores de parser/modelo.

Los documentos son datos no confiables: instrucciones incrustadas no cambian prompts, permisos, tools, red ni ranking. El buscador no interpreta instrucciones y devuelve excerpts delimitados. M5 valida integridad y aplicabilidad documental, pero no crea claims ni determina entailment final; eso permanece para Evidence/Reviewer.

## Evaluación y gates

Qrels humanos versionados incluyen consultas positivas, negativas, sin respuesta, versiones incompatibles y prompt injection. Gate inicial sobre el corpus fijado: Recall@5 ≥ 0,85, MRR@10 ≥ 0,75, 100% de spans/hashes resolubles, 100% de abstención en qrels sin respuesta, cero uso de `conflicting` como soporte específico y cero cambios de autoridad por contenido hostil. Se publican denominadores y resultados; cambiar corpus, modelo, chunker o ranking crea otra versión y reejecuta las gates.

Contract tests MCP y pruebas del loader se ejecutan sin red. La CI Linux conserva el network namespace aislado. Una prueba de ingesta usa transporte HTTP inyectado para redirects, límites y allowlist; no descarga fuentes reales durante `npm run check`.
