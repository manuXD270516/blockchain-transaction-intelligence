# Graphify local para desarrollo

Instalado: Graphify-Labs `graphifyy==0.9.67`, entorno aislado `.tools/graphify`, Python 3.14.7. Dependencias instaladas en scripts/graphify-requirements.lock.txt. Es tooling local, no el servicio hospedado graphify.com ni una suscripción configurada. No se ha medido un porcentaje de ahorro de tokens.

Verificado tras M5: extracción AST local de 31 archivos `src` (298 nodos y 918 aristas), consulta CLI y handshake MCP + query_graph exitosos (10 tools anunciadas). El índice se regenera al cambiar código; cifras posteriores pueden variar. No se enviaron archivos a modelos: code-only, sin clustering semántico ni API keys.

```powershell
./scripts/graphify.ps1 extract . --code-only --no-cluster --max-workers 1
./scripts/graphify.ps1 query normalizeInvestigation --budget 700
.tools/graphify/Scripts/python.exe scripts/verify-graphify-mcp.py
```

Instalación reproducible desde Windows: `python -m venv .tools/graphify`, luego `.tools/graphify/Scripts/python.exe -m pip install -r scripts/graphify-requirements.lock.txt`. Este lock refleja Windows/Python 3.14 y no es lock portable a todos los sistemas. La app TypeScript no depende de Python/Graphify.

Activación: AGENTS.md exige consultas al grafo antes de lecturas amplias. MCP stdio registrado en `.codex/config.toml` del proyecto y en `C:/Users/Manuel Saavedra/.codex/config.toml`, con enabled=true y sólo query_graph/get_node/get_neighbors/shortest_path/graph_stats habilitadas. Rutas absolutas deben ajustarse si se mueve el proyecto. Registro confirmado con `codex mcp get graphify --json` usando explícitamente ese CODEX_HOME; el CLI sin override usa otro contexto y no lo encontraba.

En la sesión actual, Graphify es operativo y se usa por CLI. La lista de tools nativas del host no se recarga automáticamente aquí; abrir una nueva sesión con ese perfil/proyecto permite cargar el MCP. No se afirma que aparezca ya como herramienta nativa en esta conversación. El cliente stdio local sí verificó el servidor real.

No se instalaron hooks globales, watchers ni servicio HTTP. Query logging deshabilitado. `graphify-out/` y `.tools/` no se versionan; .graphifyignore limita índice a src. El grafo es navegación, no evidencia on-chain ni prueba de corrección del código.

Fuentes: [Graphify-Labs](https://github.com/Graphify-Labs/graphify), [configuración MCP de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
