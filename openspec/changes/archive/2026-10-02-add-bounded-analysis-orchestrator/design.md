# Diseño M6 — Orquestación analítica acotada

## Alcance y autoridad

M6 implementa Transaction Analyst y Contract Analyst. Evidence Agent y Reviewer siguen `unavailable` hasta M7; por tanto la salida se denomina `analysis_draft`, nunca reporte accepted ni revisión semántica final. El baseline determinístico siempre se ejecuta primero y puede entregarse solo como `partial` o `inconclusive`.

El modelo no recibe acceso directo a MCP, red, filesystem ni secretos. Emite JSON conforme a schema con solicitudes de tools y, después, claims propuestos. El orquestador valida y ejecuta solicitudes mediante una interfaz inyectada; rechaza tool, argumentos o etapa no permitidos antes del backend. No hay texto libre fuera de campos acotados.

Roles:

- Transaction Analyst: `get_transaction`, `get_receipt`, `get_block`, `get_token_transfers`, `trace_transaction`; `get_wallet_balance` sólo cuando el input declara esa necesidad y siempre con bloque fijado.
- Contract Analyst: `get_contract`, `get_contract_events`, `search_protocol_docs`.
- Ambos pueden abstenerse y solicitar evidencia, pero no modificar permisos ni invocar otra tool por instrucciones encontradas en datos.

## Modelo y secuencia

`ModelProvider.complete` es una frontera inyectable. Su manifest declara provider/model logical id, prompt version, policy version, temperature, seed si existe y política de datos. El repositorio no habilita adapter remoto: producción sin provider devuelve baseline inconcluso; tests y demo usan `ScriptedModelProvider` offline y determinístico. Añadir un proveedor externo requiere configuración fija, secretos sólo en proceso y documentación de retención/uso de datos antes de una ejecución live.

Secuencia por run:

1. Validar investigación, chain/snapshot y política.
2. Normalizar y extraer baseline M2/M3.
3. Transaction Analyst emite cero o más solicitudes; validar/ejecutar; luego emite claims.
4. Contract Analyst sólo corre si hay contrato/emisor o la pregunta requiere semántica contractual; usa el mismo patrón.
5. Validar claims y producir draft. Una respuesta que no valida puede recibir una sola corrección de schema; no hay loop adicional.

Prompts incluyen datos estructurados mínimos, warnings/cobertura y resultados de tools. Texto de logs/docs se delimita como datos no confiables. El proveedor no ve endpoints, raw headers, secretos ni paths locales.

## Claims y baseline

`Claim` M6 incluye id content-addressed, texto máximo 2.000 caracteres, subjects, classification `OBSERVED|RULE-BASED|MODEL-INFERRED`, evidence ids, derivation/version, uncertainty `supported|limited|unknown`, limitations, alternatives, author role/model/prompt version y `review_status:proposed`.

El baseline puede emitir OBSERVED para transaction/receipt/snapshot y eventos determinísticamente decodificados, y RULE-BASED para cálculos/reglas versionadas cuyos inputs y límites estén presentes. Claims del modelo se fuerzan a MODEL-INFERRED; consenso entre roles no cambia la clase. Palabras `fraud`, `scam`, `malicious`, atribución de persona/control o certeza de causa se rechazan salvo que aparezcan como negación/limitación permitida; M6 no produce acusaciones.

Todo evidence id debe resolver dentro del bundle M2/M3 o de resultados MCP del mismo run. Citas documentales sólo aceptan chunk ids con snapshot de corpus M5. No se mezclan snapshots on-chain. El DAG se comprueba acíclico y los ids se recalculan.

## Budgets y estados

Defaults hard por run: 90.000 ms, 24 llamadas de tools, 20.000 tokens de entrada, 4.000 de salida, máximo 2 analistas, 2 llamadas de modelo por analista más una corrección global y 2 tools concurrentes. Cada intento consume presupuesto; usage desconocido se trata como presupuesto no verificable y fuerza `partial`.

Estados del draft: `complete|partial|inconclusive`. `complete` en M6 sólo significa que analistas y validadores estructurales terminaron; no equivale a reviewed/accepted. Timeout, provider ausente, tool unavailable, snapshot contradictorio, schema inválido persistente o budget agotado conserva baseline válido y enumera faltantes/razones.

El manifest del run fija schema, input hash, snapshot, corpus snapshot, provider/model/prompt/policy versions, budgets iniciales/usados/restantes, tool journal seguro, duración y warnings. No persiste datos.

## Verificación

Fixtures scripted cubren éxito nativo, receipt ausente, contrato desconocido, docs incompatibles, prompt injection, tool prohibida, tracing unavailable, budget/timeout, schema corregible e inválido persistente. Gates M6: 100% evidence ids resolubles, cero tool fuera de rol, cero acusaciones automáticas, cero claims model-inferred promocionados, tool selection ≥0,95 y baseline siempre disponible ante fallos.

Tests y CLI son offline bajo guard. Una futura prueba live de modelo será opt-in y reportará proveedor, política de datos, fecha, usage y variabilidad por separado; no forma parte de `npm run check`.
