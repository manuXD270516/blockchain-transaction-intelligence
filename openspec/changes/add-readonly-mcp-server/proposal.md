# M4 — blockchain-mcp-server read-only

## Problema

M1–M3 ofrecen adquisición, normalización y extracción como APIs internas, pero los agentes todavía no disponen de una frontera MCP validada, acotada y auditable.

## Cambio

Crear un servidor MCP local por stdio con las nueve tools del contrato fundacional. Las capacidades existentes se exponen mediante un servicio validado; tracing y RAG responden `unavailable` hasta sus hitos. Todas las tools son read-only, tienen schemas cerrados, respuestas estructuradas y errores seguros.

## Fuera de alcance

HTTP remoto, autenticación multiusuario, RPC configurable, firma, envío de transacciones, tracing real, corpus RAG, ABI arbitrario, proxies y persistencia. M4 no convierte resultados en claims ni reportes de agentes.

