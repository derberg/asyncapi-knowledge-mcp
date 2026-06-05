"""
Stdio smoke test for the AsyncAPI Knowledge MCP server via the PyPI package path.

Uses `uvx opencrane serve --transport stdio` (requires a built opencrane index:
  uvx opencrane embed && uvx opencrane index

Usage:
    MILVUS_DB_PATH=.opencrane/milvus.db uv run --with mcp python tests/smoke_query.py
"""
import asyncio, os, sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

QUERY = "What is a channel in AsyncAPI and how is it used?"
DB_PATH = os.environ.get("MILVUS_DB_PATH", ".opencrane/milvus.db")


async def main() -> int:
    env = dict(os.environ)
    if os.path.exists(DB_PATH):
        env["MILVUS_DB_PATH"] = DB_PATH
    params = StdioServerParameters(
        command="uvx",
        args=["opencrane", "serve", "--transport", "stdio"],
        env=env,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            names = [t.name for t in tools]
            print("TOOLS:", names)
            assert names, "no tools exposed by the MCP server"
            search = next(
                (t for t in tools
                 if "search" in t.name.lower() or "query" in t.name.lower() or "doc" in t.name.lower()),
                tools[0],
            )
            print("USING TOOL:", search.name)
            props = (search.inputSchema or {}).get("properties", {})
            arg = next((k for k in ("query", "q", "question", "text") if k in props), None)
            args = {arg: QUERY} if arg else {"query": QUERY}
            result = await session.call_tool(search.name, args)
            text = "\n".join(
                getattr(c, "text", "") for c in result.content if getattr(c, "text", "")
            )
            print("RESULT (first 800 chars):\n", text[:800])
            assert text.strip(), "search returned empty content"
            assert ("asyncapi" in text.lower() or "channel" in text.lower()), (
                "result did not reference AsyncAPI concepts"
            )
            print("SMOKE TEST PASSED")
            return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
