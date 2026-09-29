# Verificación M0–M6

Entorno local: Windows, Node 22.23.1, npm 10.9.8, TypeScript 5.9.3, OpenSpec 1.11.0. Fecha: 2026-09-29.

- `npm run check`: typecheck estricto y build correctos; 135 tests, 134 aprobados, 0 fallidos y 1 omitido en Windows (symlink de archivo).
- `openspec validate --all --strict --no-interactive`: 9 changes válidos, 0 errores.
- Regeneración de fixtures con comparación SHA-256 antes/después: 0 archivos modificados.
- M0: replay de tres fixtures sintéticos, integridad SHA-256, esquemas, límites de archivo, escape de directorio, estados y CLI offline determinístico.
- M1: respuestas RPC sintéticas en test/data/sepolia-synthetic.json; chain mismatch, reorg, logs ajenos, pending, not_found, missing receipt/block, errores pruned/unsupported, reintentos, budgets, timeout/abort, JSON-RPC envelopes y tamaños.
- M2: golden en test/data/normalization-golden.json; uint256 máximo, cero/null, creación, tipos desconocidos, fees execution/blob, raw preservado, DAG/IDs/checksums/pointers, deep freeze, revalidación de snapshot/finality y fuentes RPC. CLI fixture reproduce el bundle byte a byte bajo guard offline. No se ejecutaron nuevas llamadas live en M2.
- M3: firmas Keccak canónicas, discriminación ERC-20/ERC-721, ERC-1155 single/batch, padding y ABI estrictos, límites, fixture reproducible, evidencia derivada, grafo base, determinismo, receipt ausente y logs incompatibles con un receipt revertido. No se ejecutaron llamadas live en M3.
- M4: nueve tools MCP con schemas cerrados y annotations read-only; envelopes de éxito/error, abstenciones, validación independiente, mensajes seguros, límite de rango/página/respuesta, cursores HMAC adulterados/expirados/ligados a tool, consulta y snapshots, y eventos `{raw, decoded}` ordenados. Las pruebas cubren los nueve handlers mediante cliente MCP.
- M5: snapshot `d9fcac75b6b1e87c38273e826630547676101b8fa70892709bad267df2b8b8c1`, 6 documentos, 139 chunks y 384 dimensiones. Loader, hashes, rutas, tamaños, spans PDF/Markdown, vectors, adulteración, allowlist y degradación sin corpus están cubiertos.
- `npm run rag:verify`: snapshot íntegro, 6 documentos y 139 chunks.
- `npm run rag:eval`: 7 qrels; Recall@5 1,00, MRR@10 0,8667, abstención 1,00 y versión segura. Incluye casos positivos, negativos, versiones incompatibles y prompt injection.
- El entrypoint compilado stdio se ejecutó bajo guard offline con un cliente MCP real: negociación moderna, 9 tools, tracing `unavailable` y `search_protocol_docs` activo con una cita ERC-721. El proceso no abrió red.
- Una prueba adicional lanzó exactamente `npm run mcp`: protocolo moderno, 9 tools, búsqueda ERC-1155 `ok`, 2 hits, primer documento `eip-1155` y stderr vacío.
- MiniLM se ejecuta localmente mediante `onnxruntime-web` WASM y WordPiece fijado; `npm ci --ignore-scripts` no necesita binarios nativos ni postinstall. El modelo ONNX, vocabulario y archivos de configuración están incluidos en el manifest con licencia Apache-2.0 y hashes.
- M6: baseline content-addressed, claims OBSERVED/RULE-BASED/MODEL-INFERRED, provider manifest, roles Transaction/Contract, allowlists, argumentos cerrados, snapshot único, tool journal, presupuestos, timeout y una corrección máxima. Claims de otro run, atribuciones prohibidas y docs conflicting son rechazados.
- `npm run agent:eval`: 5 casos, tool selection 1,00 y 0 ejecuciones prohibidas. Incluye receipt permitido, docs fuera de rol, balance no solicitado/solicitado y expansión de argumentos.
- `npm run analyze -- synthetic-native-success` opera offline sin provider: conserva baseline, devuelve inconclusive/MODEL_PROVIDER_NOT_CONFIGURED y declara REVIEW_NOT_RUN.
- El guard MCP bloquea APIs HTTP/HTTPS/TCP/TLS, `fetch` y WebSocket sin interferir con stdio. Es un guard de regresión para el proceso confiable, no un sandbox para código hostil.
- Graphify se regeneró en modo code-only, sin clustering ni APIs de modelos: 366 nodos y 1.106 aristas.
- El guard local bloquea imports de red/fetch/WebSocket para CLI offline y tiene prueba negativa propia. No constituye aislamiento de código hostil.
- GitHub Actions `Offline foundation` ejecutado en Linux sobre `76a96b2`: job `verify` aprobado en 37 s. Incluyó instalación reproducible, typecheck, build, tests dentro de un network namespace sin conectividad, symlink de archivo y regeneración de fixtures sin diff. Run: https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36526037696.
- GitHub Actions ejecutado sobre M5 `a68be96`: job `verify` aprobado en 49 s; 126 tests, 126 aprobados, 0 fallidos y 0 omitidos dentro del network namespace sin conectividad. Run: https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36529005511.
- GitHub Actions ejecutado sobre M6 `7662ff7`: job `verify` aprobado; 135 tests, 135 aprobados, 0 fallidos y 0 omitidos dentro del network namespace sin conectividad. Run: https://github.com/manuXD270516/blockchain-transaction-intelligence/actions/runs/36530438833.
- El test de symlink de archivo se omite localmente en Windows y se ejecutó en la CI Linux; el escape mediante junction sí se ejecutó localmente.
- No se ejecutó una lectura live nueva para M4: la verificación MCP usó backends simulados y la llamada stdio a una capacidad diferida que no consulta RPC.
- Para construir M5 se descargaron explícitamente, y sólo durante la fase administrativa, fuentes públicas fijadas de GitHub y el modelo ONNX fijado de Hugging Face. Búsqueda, MCP, evals y tests se ejecutaron offline. No se realizó ninguna lectura blockchain live nueva.
- M6 no realizó llamadas a modelos ni blockchain live. El provider scripted es un double determinístico dentro del proceso; no hay credenciales, endpoint remoto ni política de terceros activa.

## Smoke live ejecutado

Comando: `node dist/live-cli.js smoke` contra el endpoint fijo PublicNode de Sepolia. Tres lecturas (chain ID, bloque finalized y comprobación por número), sin firma ni fondos.

Resultado observado:

- chain_id: `11155111`
- block_number: `11773572`
- block_hash: `0xdcf63eabe13e76719781925cb78f91d401b7aae27d4a219498f9b45953a5e950`
- finality solicitada y reportada por proveedor: `finalized`
- intentos RPC: `3`

Esto verifica conectividad TLS, transporte real y adquisición de bloque; no acredita una investigación live completa, ni la corrección universal del proveedor. Las investigaciones de transacciones y lecturas de estado se verificaron con transporte simulado reproducible. No se persistió una captura pública de transacción ni se presentan fixtures synthetic como datos live.
