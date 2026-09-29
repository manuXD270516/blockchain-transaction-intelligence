"""Local stdio handshake and query, no remote service or model call."""
import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    root = Path(__file__).resolve().parent.parent
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "graphify.serve", str(root / "graphify-out" / "graph.json")],
        env={**os.environ, "PYTHONUTF8": "1", "PYTHONHASHSEED": "0", "GRAPHIFY_QUERY_LOG_DISABLE": "1"},
    )
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool("query_graph", {"question": "normalizeInvestigation", "token_budget": 400})
            assert not result.is_error, "Graph query failed"
            text = "\n".join(item.text for item in result.content if hasattr(item, "text"))
            assert "normalizeInvestigation" in text, "Expected source symbol not found"
            print(json.dumps({"mcp_verified": True, "tool_count": len(tools.tools),
                              "query": "normalizeInvestigation", "result_chars": len(text)}))


asyncio.run(main())
