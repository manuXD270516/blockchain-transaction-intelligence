# Threat model

Activos: integridad del reporte, raw evidence, corpus, configuración, credenciales RPC/modelo, privacidad de consultas, disponibilidad y presupuesto. Adversarios: proveedor comprometido, autor de contrato/log/token/documento hostil, usuario abusivo y agente confundido. No se asume honestidad de contenido público.

Límites de confianza: usuario→API; API→orquestador; agente→MCP; MCP→proveedor; ingesta→corpus; modelo→claim; reporte→navegador. Los controles residen en servicios/políticas y validadores, no sólo en prompts.

| Amenaza | Control requerido | Verificación futura / riesgo residual |
|---|---|---|
| Firma o movimiento de fondos | No key store, signer, wallet connection ni sendTransaction; allowlist RPC cerrada | Intentos directos y vía prompt rechazados antes de red; proveedor aún observa consultas |
| Prompt injection en logs, ABI, símbolos o docs | Tratar contenido como datos delimitados; no adoptar instrucciones; permisos fijos por rol | Fixture que ordena revelar secretos o usar otra tool no cambia permisos; persiste riesgo semántico de LLM |
| SSRF y exfiltración | Endpoints/corpus administrados; tools sin URL arbitraria; egress allowlist; sin redirects no verificados ni destinos privados | Hostnames, redirects y DNS rebinding bloqueados; claves nunca entran al prompt |
| RPC falso/inconsistente/reorg | Chain id, hashes y snapshot verificados; conflicto visible, raw conservado | Mismatch bloquea aceptación; un proveedor único puede mentir consistentemente, no se declara verificación trustless |
| ABI o nombre fraudulento | Procedencia, code hash y bloque; desconocido por defecto | ABI equivocada no produce identidad aceptada; verificación de source no certifica seguridad |
| RAG poisoning/cita decorativa | Corpus allowlisted, revisión de versiones y checksum; validar span y soporte de claim | Documento incompatible/inyección no sustenta claim; publicación oficial puede contener errores |
| DoS/costos | Límites de bytes, rangos, timeouts, profundidad, herramientas, tokens y concurrencia | Respuestas gigantes y loops terminan en partial/budget_exceeded |
| XSS en metadatos/reporte | Escapar texto, sanitizar Markdown, sin HTML/scripts ni URLs ejecutables | Símbolo con script se muestra como texto; no cargar recursos remotos automáticamente |
| Filtración de privacidad | No vincular direcciones a personas; redacción de secretos y minimización de telemetría | Logs no contienen headers, prompts íntegros ni claves; consultas a RPC/LLM revelan datos al proveedor configurado |
| Falsa acusación o certeza | Clasificación obligatoria, citas, revisión estructural y abstención | Patrones no se convierten en fraude/scam/intención; revisión LLM por sí sola no basta |
| Dependencia/corpus manipulado | Versiones y hashes fijados, procedencia/licencia, validación de importación | Alteración de fixture o chunk invalida manifest y replay |

Política inicial: sin secretos en fixtures, reportes o repositorio. Credenciales sólo en proceso servidor mediante configuración de entorno; errores las redactan. Retención local de investigaciones 30 días por defecto, configurable; demo elimina runs efímeros en 24 horas y usa corpus/fixtures públicos persistentes. Borrar un run elimina sus derivados y refs privadas sin romper fixtures públicos compartidos. La política deberá implementarse y verificarse antes de M11.

La demo no ofrecerá ingesta arbitraria, RPC configurable por visitante ni consultas live ilimitadas. MCP inicial usa stdio local; exponer transporte remoto requiere un change con autenticación, autorización, validación de Origin, cuotas por identidad y aislamiento. No se afirma auditoría de seguridad ni detección de fraude.
