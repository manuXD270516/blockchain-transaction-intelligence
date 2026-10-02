# Límites de agentes

Los agentes son roles del producto futuro; no se ejecutan en esta fase. Comparten evidencia inmutable pero no memoria libre con instrucciones de otras investigaciones.

| Rol | Responsabilidad | Tools permitidas | Salida y prohibiciones |
|---|---|---|---|
| Transaction Analyst | Reconstruir secuencia, estado y movimientos reportados | get_transaction, get_receipt, get_block, get_token_transfers, trace_transaction | Claims y orden parcial; no inventar llamadas sin traza ni causa por status |
| Contract Analyst | Interpretar código/ABI y eventos; vincular contexto documental | get_contract, get_contract_events, search_protocol_docs | Identidad y semántica con versión; no certificar seguridad ni atribuir control humano |
| Evidence Agent | Resolver referencias, procedencia, clases y contradicciones | Ninguna tool externa; lector interno de evidence/corpus del run | Hallazgos estructurados; no generar nuevas observaciones ni reparar citas inventándolas |
| Reviewer Agent | Evaluar soporte de conclusiones, alternativas y límites | Ninguna tool externa; reporte candidato + evidencia referenciada | supported/rejected/needs_revision por claim; no saltar validadores ni cambiar raw |

`get_wallet_balance` sólo se habilita al Transaction Analyst cuando la pregunta pide ese contexto y con bloque fijado. Toda lectura de rango queda limitada a la investigación. Los agentes no pueden elevar permisos ni incorporar nuevas tools. Evidence/Reviewer pueden solicitar evidencia faltante al orquestador, sin acceso directo a red.

Secuencia: validar entrada/política→fijar snapshot→baseline extracción→Transaction Analyst→Contract Analyst si hace falta→Evidence Agent→Reviewer→validación determinística final→reporte. Máximo una vuelta de corrección; pedir datos adicionales consume el mismo presupuesto global. Llamadas no justificadas se rechazan. Trace se pide para llamadas internas/causas, no rutinariamente si el receipt basta. RAG se pide para semántica técnica, no para leer valores on-chain.

Prompts, modelo, temperatura, tools visibles, policy y budgets quedan versionados en manifest. Respuestas del modelo deben ajustarse al schema de Claim; texto libre no pasa directo a reporte. Si el modelo no responde, presupuesto vence o la evidencia es contradictoria, entregar baseline validado como partial/inconclusive y explicar faltantes. Reviewer no se usa como único oráculo ni como garantía por ser otro agente; errores correlacionados se evalúan con oráculos humanos y determinísticos.
