# Verificación M0–M11

## Re-verificación del 2026-10-01 (local)

Entorno: Windows, Node 22.23.1, npm 10.9.8 y OpenSpec 1.11.0. Sin credenciales, proveedor de modelos, RPC ni red, salvo para `npm ci` y la descarga de la imagen Docker.

### Windows

- `npm run check` sobre el código previo, `4e5b367`: 173 tests, 172 aprobados, 0 fallidos y 1 omitido (symlink de archivo en Windows).
- `npm run check` sobre el código final, `3f2b669`: 184 tests, 183 aprobados, 0 fallidos y 1 omitido (el mismo symlink).
- `openspec validate --all --strict --no-interactive`: 15 changes válidos, 0 errores.
- `npm run rag:verify`: snapshot `d9fcac75…`, 6 documentos y 139 chunks.
- `npm run rag:eval`: Recall@5 1,00, MRR@10 0,8667, abstención 1,00 y versión segura (7 qrels).
- `npm run agent:eval`: tool selection 1,00 y 0 ejecuciones prohibidas (5 casos).
- `npm run review:eval`: status_accuracy 1,00 y 0 en todas las métricas de seguridad (11 casos).
- `node dist/eval-cli.js run`: release no bloqueado; 22 gates aprobadas y 2 not_applicable (identificación de contratos sin casos y latencia con modelo). El `result_id` del demo, `487b16ce…`, no cambió tras añadir trazas.
- `npm run demo:site`: 6 archivos, `published: false`.
- Regenerar fixtures, incluidas las trazas, no produjo diff.

### Contenedor Linux

`scripts/local-linux-ci.ps1` usa `node:22.23.1-bookworm` en Docker 29.8.1 sobre WSL2, kernel 6.6.87.2. Es evidencia local: no sustituye ni registra la CI remota de GitHub Actions, bloqueada por facturación.

1. Clona el commit confirmado y ejecuta `npm ci --ignore-scripts`, typecheck y build.
2. Con `--network none`, verifica el aislamiento: sólo la interfaz `lo` y `fetch` falla con `EAI_AGAIN`.

Ejecuciones:

- Sobre `4e5b367`: 173 tests, 173 aprobados, 0 omitidos (incluye el symlink de archivo).
- Sobre `314dbe2`: 184 tests, 184 aprobados, 0 fallidos y 0 omitidos.
- Sobre `3f2b669`, el código final, con el script versionado: 184 tests, 184 aprobados, 0 fallidos y 0 omitidos.

En todas, la regeneración de fixtures quedó sin diff y todos los evals pasaron con los mismos valores que en Windows. `demo-cli build` terminó con `published: false`.

### Implementado en esta re-verificación

- Change `add-offline-call-traces`, con 11 tests nuevos:
  - Subllamada revertida en una transacción exitosa, frames bajo ancestro revertido y DELEGATECALL con contexto/código sin valor efectivo.
  - Raíz revertida sin razón, que deja la causa desconocida, y razón reportada por el tracer.
  - Truncación por frames y por profundidad, y raíz incoherente con transacción o receipt.
  - Schema desconocido, checksum adulterado y tamaño excesivo.
  - Grafo con aristas `internal_call`; sin traza, la vista es idéntica.
  - Texto de error hostil escapado.
  - `trace_transaction` `ok`/`partial`/`INCONSISTENT_SNAPSHOT` con un backend de trazas inyectado.
  - CLIs bajo guard offline.
- Aserción nueva, en el test ERC-1155 existente, para arrays de longitudes distintas: `BATCH_ARRAY_LENGTH_MISMATCH`, sin transferencias parciales.
- Aserción nueva de denominadores por split (dev/test) y familia en el runner M9, con N/A explícito en el split sin casos.
- Graphify regenerado en modo code-only: 636 nodos y 1.938 aristas.
- No hubo llamadas a modelos, blockchain live, RPC ni APIs de pago.

## Verificación del 2026-09-29

Entorno local: Windows, Node 22.23.1, npm 10.9.8, TypeScript 5.9.3, OpenSpec 1.11.0. Fecha: 2026-09-29.

- `npm run check`: typecheck estricto y build correctos; 173 tests, 172 aprobados, 0 fallidos y 1 omitido en Windows (symlink de archivo).
- `openspec validate --all --strict --no-interactive`: 14 changes válidos, 0 errores.
- CI Linux remota de M7–M11: no ejecutada. El run 36534722111 de M7 no arrancó por la facturación de la cuenta GitHub y el usuario decidió omitir la CI; las tareas 3.1 siguen abiertas.
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
- M7: índice de evidencia reconstruido desde investigación y journal, recálculo de claim ids y hashes del DAG, snapshots y documentos conflicting, clases incoherentes, overreach de transferencias, lenguaje prohibido, hallazgos de Evidence Agent, peticiones de evidencia irresolubles, denegación de tools a Evidence/Reviewer, corrección compartida con analistas, deadline y tokens compartidos, anomalías tipadas y rechazo de drafts de otra investigación.
- `npm run review:eval`: 11 casos; status_accuracy 1,00 y 0 en evidencia publicada irresoluble, acusaciones automáticas, inferencias promocionadas, accepted con claims no soportados y ejecuciones de tools.
- `npm run report -- synthetic-reverted` opera offline sin provider: 3 hechos validados, anomalía OBSERVED `receipt_reports_reverted`, estado inconclusive y `REVIEW_IS_NOT_A_SECURITY_AUDIT`.
- M7 no realizó llamadas a modelos ni blockchain live; Evidence Agent y Reviewer se verificaron con el provider scripted en proceso.
- M8: 5 tests. Grafo sin trazas con sólo aristas observables y evidencia resoluble; revert y pending como reverted/unknown; etiquetas hostiles escapadas sin scripts, handlers, `src` ni URLs; truncación declarada (3 de 11); CLI offline bajo guard.
- M9: 8 tests. Run limpio con denominadores explícitos y `result_id` reproducible; métricas sin casos en N/A con gate not_applicable y métricas de seguridad ausentes que fallan cerradas; fixture adulterado en copia temporal que bloquea release; violación de política y sub-eval roto o malformado que bloquean release; comparación rechazada con claves distintas; dashboard inerte; CLI real offline bajo guard. Un test detectó que un sub-eval caído producía métricas N/A en vez de `unavailable`; se corrigió.
- `node dist/eval-cli.js run` (30 repeticiones): release no bloqueado; 22 gates aprobadas, 0 fallidas y 2 not_applicable (identificación de contratos sin casos identificados y latencia con modelo); reconstrucción y eventos F1 1,00; abstención contractual 5/5; latencia offline sin modelo p50 1,68 ms y p95 4,23 ms en 120 runs, no un SLA.
- M10: 8 tests. Redacción de userinfo, claves en ruta, query, Bearer y pares clave/valor, idempotente y sin tocar hashes; reportes de los fixtures idénticos tras redactar; traza con un `trace_id`, parents válidos, budgets y versiones en la raíz, tool denegado contado una vez y sin pregunta en claro; reporte idéntico con y sin tracer; error de modelo con mensaje redactado; límite de 256 spans y OTLP-JSON válido; store con guardado, listado, borrado y barrido a las 24 h sin tocar fixtures; raíces inseguras, ids maliciosos y retención inválida rechazados; CLIs offline bajo guard.
- M11: 7 tests. Build reproducible de 6 páginas con límites, privacidad y CSP; release bloqueado sin escribir archivos; fixture curado adulterado rechazado; HTML hostil escapado y URLs en la selección rechazadas; auditoría que detecta script, formulario, URL externa, enlace o ancla rotos, `url()` y CSP ausente; salida insegura o directorio ajeno no vacío rechazados; CLI offline con `published: false`. `npm run demo:site` generó `dist-demo/` localmente; no se publicó.
- M8–M11 no realizaron llamadas a modelos, blockchain live ni red.
- Graphify se regeneró en modo code-only, sin clustering ni APIs de modelos: 603 nodos y 1.817 aristas.
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
