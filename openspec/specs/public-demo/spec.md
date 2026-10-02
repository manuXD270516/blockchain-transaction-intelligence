# public-demo Specification

## Purpose
Publicar una demo estática construida sólo con fixtures curados, sin contenido activo ni recolección de datos, y únicamente después de pasar los gates de evaluación y la verificación del sitio en vivo.

## Requirements

### Requirement: sitio estático con fixtures curados

El sistema SHALL generar un sitio estático sólo a partir de fixtures curados con checksums verificados, con índice que muestre propósito, límites, privacidad y estado de evaluación, y una página por fixture con reporte revisado offline y grafo con evidencia.

#### Scenario: build reproducible
- **WHEN** se construye dos veces con los mismos fixtures y evaluación
- **THEN** los archivos y el manifest de hashes son idénticos

#### Scenario: fixture curado adulterado
- **WHEN** un fixture listado no coincide con sus checksums
- **THEN** la build falla con `INVALID_DEMO_FIXTURE` sin escribir salida

### Requirement: sin contenido activo ni recolección de datos

Cada página SHALL declarar CSP `default-src 'none'` y SHALL carecer de scripts, formularios, entradas, recursos externos, wallet y consultas live; los enlaces SHALL ser anclas locales o páginas del propio sitio.

#### Scenario: HTML hostil en la selección
- **WHEN** el título o la lección de un fixture contiene etiquetas o atributos HTML
- **THEN** aparece escapado como texto y la auditoría del sitio pasa

#### Scenario: URL en la selección
- **WHEN** el título o la lección contiene una URL absoluta o ejecutable
- **THEN** la build falla con `INVALID_DEMO_CONFIG` antes de renderizar

#### Scenario: auditoría detecta contenido activo
- **WHEN** una página contiene script, formulario, URL externa o enlace roto
- **THEN** la build falla con `UNSAFE_OUTPUT`

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
