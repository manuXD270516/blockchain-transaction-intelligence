# Evidence model y agent claims v1

## Evidencia inmutable

`Evidence`: evidence_id (hash de contenido canónico + contexto), schema_version, kind (`rpc_raw|fixture_raw|decoded|derived|document_span`), source_id, source_version, chain_id?, tx_hash?, block_hash?, locator (JSON Pointer, log_index, trace_path o chunk/span), content_hash, captured_at, parent_evidence_ids[], transformation/version?, availability y trust_notes. Timestamp/proveedor forman procedencia; no convierten una respuesta RPC en prueba criptográfica. Preservar bytes originales o referencia verificable y hash; una transformación nunca reemplaza raw.

`Claim`: claim_id, text, subject_refs[], classification (`OBSERVED|RULE-BASED|MODEL-INFERRED`), evidence_ids[], derivation?, uncertainty (`supported|limited|unknown`), limitations[], alternatives[], author_role/model/prompt_version, review_status y review_reasons. Los ids de citas deben resolver dentro del manifest del reporte. Un claim derivado exige parents hasta raw/docs, con grafo acíclico.

- OBSERVED: campo visto en fuente identificada, o decodificación determinística cuya ABI/layout y raw están citados. Formular «el receipt reporta» o «el contrato emitió», sin elevarlo a intención ni garantía de estado.
- RULE-BASED: regla determinística versionada con inputs, umbral, unidades, población/ventana si aplica, resultado y limitaciones; también cálculos de fees.
- MODEL-INFERRED: interpretación o hipótesis del modelo, citando datos y documentación aplicable; explicación de incertidumbre y alternativas. Nunca se promociona a OBSERVED por consenso de agentes.

Un `Anomaly` referencia un Claim con una de esas tres etiquetas. OBSERVED describe una condición explícita, por ejemplo receipt.status=0, sin afirmar que sea estadísticamente excepcional. RULE-BASED puede marcar número de eventos sobre un umbral educativo configurado; un umbral no prueba daño. MODEL-INFERRED puede sugerir que una secuencia es compatible con cierto patrón, sin atribución de intención. Sin baseline declarado, no usar términos «inusual para esta wallet» ni probabilidades numéricas de fraude. No hay conversión automática a fraud, scam o malicious behavior.

## Revisión y reporte

Evidence Agent valida referencias, integridad, snapshots, spans, transformaciones y coherencia de clases. Reviewer contrasta afirmación con evidencia y busca conclusiones más fuertes que sus premisas. Validadores estructurales se ejecutan aunque el modelo apruebe. Un id válido no implica soporte semántico.

Estados de claim: proposed→supported|rejected|needs_revision. Un reporte accepted requiere todos sus claims sustantivos supported, incluidos inferidos correctamente acotados. Rejected no aparece como conclusión; puede aparecer en auditoría con motivo. Después de una corrección máxima, cualquier defecto produce reporte inconclusive con hechos validados y limitaciones; no se oculta el rechazo. Datos parciales permiten reporte partial si no se atribuye cobertura total; contradicción de snapshot impide accepted.

Reporte versionado: entrada y modo (synthetic/public_snapshot/testnet_live), resumen, timeline con orden parcial, entidades, eventos, transferencias event_reported, llamadas si disponibles, fallo/causa y certeza separados, anomalías tipadas, tabla claim→evidence→fuente, documentación citada, limitaciones, revisión, cobertura, latencia/tokens y replay manifest. Siempre identificar datos sintéticos; una fuente documental nunca acredita ejecución de una transacción particular.

## Ejemplo conceptual

«El receipt reporta status=0» es OBSERVED y cita `/status`. «La llamada revirtió con Error(string)» requiere traza/error bytes y decodificador identificado; sin ellos, la causa es desconocida. «Probablemente faltó allowance» sólo podría ser MODEL-INFERRED si hay evidencia pertinente y alternativas explícitas; no se deduce del status por sí solo.

Un log Transfer cita emisor, topics/data y ABI/layout. No acredita por sí solo saldo neto, propiedad económica ni conformidad del token. Decimals/symbol faltantes quedan null; mostrar unidades raw, sin asumir 18. ERC-20 y ERC-721 comparten firma nominal Transfer: validar forma y ABI, mantener ambiguo si no basta. En ERC-1155 batch, conservar batch_index y verificar longitudes ids/values.
