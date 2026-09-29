## Why
El usuario solicita Graphify instalado y activo antes de M3 para consultar contexto de código de forma compacta.
## What Changes
- Instalar Graphify-Labs graphifyy 0.9.67 en entorno Python aislado del proyecto.
- Indexar código local sin modelos, habilitar guía del proyecto y verificar consultas CLI/MCP.
- Documentar alcance de activación y no afirmar ahorro de tokens no medido.
## Capabilities
### New Capabilities
- `local-code-graph`: índice local consultable para trabajo de desarrollo.
### Modified Capabilities
Ninguna.
## Impact
Tooling de desarrollo únicamente; no es el grafo de transacciones M8 ni una dependencia de runtime. Configuración MCP local, sin servicio HTTP ni envío de repositorio a modelos.
