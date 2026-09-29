## Why

M0–M10 sólo se usan por CLI. El roadmap pide una demo educativa con fixtures curados, límites y privacidad visibles, sin wallet ni escritura on-chain, que sólo se publique si pasan las gates previas. Publicar es una decisión del usuario; este change deja el sitio listo pero no lo despliega.

## What Changes

- Añadir `demo/fixtures.json` con fixtures curados, título y explicación educativa por caso; sólo fixtures con checksums verificados.
- Generar un sitio estático: índice con propósito, límites, privacidad y estado de evaluación; una página por fixture con reporte revisado offline (sin provider de modelo) y grafo con evidencia; y el dashboard de evaluación.
- Sin JavaScript, formularios, cookies, recursos externos, wallet ni consultas live; CSP estricta en cada página.
- Negarse a construir si el runner M9 bloquea release o si la auditoría del HTML generado encuentra contenido activo, URLs externas o enlaces rotos.
- Escribir en `dist-demo/` (gitignored) con un manifest de hashes por archivo.
- Documentar el hosting propuesto (estático, p. ej. GitHub Pages) sin crear workflows de despliegue ni publicar.

## Capabilities

### New Capabilities

- `public-demo`: selección curada, generación estática, auditoría del sitio y preparación de hosting.

### Modified Capabilities

Ninguna.

## Impact

Se añaden `src/demo`, `demo/fixtures.json`, CLI `demo:site`, tests y `dist-demo/` al gitignore. Sin dependencias, red ni provider. No hay despliegue: publicar requiere autorización explícita y, en un repositorio privado, un plan que permita Pages o un host estático alternativo. Autenticación y cuotas por identidad no aplican a un sitio estático sin entrada de usuario.
