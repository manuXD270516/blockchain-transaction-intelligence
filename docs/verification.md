# Verificación M0–M3

Entorno local: Windows, Node 22.23.1, TypeScript 5.9.3. Fecha: 2026-09-25.

- `npm run check`: typecheck estricto y build correctos; 109 tests, 108 aprobados, 0 fallidos y 1 omitido en Windows (symlink de archivo).
- `openspec validate --all --strict --no-interactive`: 6 changes válidos, 0 errores.
- Regeneración de fixtures con comparación SHA-256 antes/después: 0 archivos modificados.
- M0: replay de tres fixtures sintéticos, integridad SHA-256, esquemas, límites de archivo, escape de directorio, estados y CLI offline determinístico.
- M1: respuestas RPC sintéticas en test/data/sepolia-synthetic.json; chain mismatch, reorg, logs ajenos, pending, not_found, missing receipt/block, errores pruned/unsupported, reintentos, budgets, timeout/abort, JSON-RPC envelopes y tamaños.
- M2: golden en test/data/normalization-golden.json; uint256 máximo, cero/null, creación, tipos desconocidos, fees execution/blob, raw preservado, DAG/IDs/checksums/pointers, deep freeze, revalidación de snapshot/finality y fuentes RPC. CLI fixture reproduce el bundle byte a byte bajo guard offline. No se ejecutaron nuevas llamadas live en M2.
- M3: firmas Keccak canónicas, discriminación ERC-20/ERC-721, ERC-1155 single/batch, padding y ABI estrictos, límites, fixture reproducible, evidencia derivada, grafo base, determinismo, receipt ausente y logs incompatibles con un receipt revertido. No se ejecutaron llamadas live en M3.
- El guard local bloquea imports de red/fetch/WebSocket para CLI offline y tiene prueba negativa propia. No constituye aislamiento de código hostil.
- Workflow Linux configurado con network namespace sin conectividad; todavía no ejecutado remotamente. El test de symlink de archivo se omite en Windows; el escape mediante junction sí se ejecuta aquí.

## Smoke live ejecutado

Comando: `node dist/live-cli.js smoke` contra el endpoint fijo PublicNode de Sepolia. Tres lecturas (chain ID, bloque finalized y comprobación por número), sin firma ni fondos.

Resultado observado:

- chain_id: `11155111`
- block_number: `11773572`
- block_hash: `0xdcf63eabe13e76719781925cb78f91d401b7aae27d4a219498f9b45953a5e950`
- finality solicitada y reportada por proveedor: `finalized`
- intentos RPC: `3`

Esto verifica conectividad TLS, transporte real y adquisición de bloque; no acredita una investigación live completa, ni la corrección universal del proveedor. Las investigaciones de transacciones y lecturas de estado se verificaron con transporte simulado reproducible. No se persistió una captura pública de transacción ni se presentan fixtures synthetic como datos live.
