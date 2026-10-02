## MODIFIED Requirements

### Requirement: gates antes de publicar

La build SHALL negarse si el runner de evaluación bloquea release y SHALL no desplegar por sí misma. La publicación SHALL ocurrir únicamente mediante el workflow `Publish demo`, después de tests sin red, evaluación sin `release_blocked`, build con gates y verificación en disco del sitio. `published: true` SHALL emitirse sólo tras verificar el sitio desplegado.

#### Scenario: release bloqueado
- **WHEN** la evaluación devuelve `release_blocked=true`
- **THEN** la build falla con `RELEASE_BLOCKED`, no escribe archivos y el workflow no despliega

#### Scenario: salida insegura
- **WHEN** el directorio de salida es la raíz del proyecto o está dentro de fixtures, corpus o src
- **THEN** la build falla con `UNSAFE_OUTPUT_DIR`

#### Scenario: sitio alterado tras la build
- **WHEN** un archivo construido cambia, falta, sobra o contiene contenido activo antes de subirlo
- **THEN** `demo-cli verify` falla con `UNSAFE_OUTPUT` y no se sube ni despliega nada

#### Scenario: verificación en vivo
- **WHEN** el sitio desplegado difiere del manifest, carece de CSP estricta o contiene un patrón de secreto
- **THEN** la verificación falla y no se emite `published: true`

#### Scenario: publicación verificada
- **WHEN** todas las páginas desplegadas coinciden byte a byte con el manifest y pasan los controles
- **THEN** se emite `published: true` con URL, `evaluation_result_id` y commit
