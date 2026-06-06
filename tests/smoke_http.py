"""
HTTP smoke test for the AsyncAPI Knowledge MCP server.

Tests the public OpenCrane MCP endpoint (Hugging Face Space) over MCP Streamable HTTP.

Usage:
    uv run --with mcp python tests/smoke_http.py

Override the endpoint:
    MCP_URL=http://localhost:8000/http uv run --with mcp python tests/smoke_http.py
"""
import asyncio, os, sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

BASE = os.environ.get("MCP_URL", "https://derberg-asyncapi-knowledge-mcp.hf.space/http")
# Try the configured URL first, then common path variants.
CANDIDATES = [BASE.rstrip("/")]
if not BASE.rstrip("/").endswith("/mcp"):
    CANDIDATES.append(BASE.rstrip("/") + "/mcp")
CANDIDATES.append(BASE.rstrip("/") + "/")

QUERY = "what is a channel in AsyncAPI"


async def try_url(url: str) -> int:
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            names = [t.name for t in tools]
            print(f"CONNECTED {url} TOOLS={names}")
            assert "search_docs" in names, f"search_docs not exposed at {url}"
            result = await session.call_tool("search_docs", {"query": QUERY})
            text = "\n".join(
                getattr(c, "text", "") for c in result.content if getattr(c, "text", "")
            )
            print("RESULT (first 400 chars):\n", text[:400])
            assert text.strip(), "search_docs returned empty content"
            assert "Source:" in text, (
                "result did not contain a 'Source:' citation — "
                "check that the MCP handler formats citations correctly"
            )
            print("HTTP SMOKE TEST PASSED")
            return 0


async def main() -> int:
    last = None
    seen = set()
    for url in CANDIDATES:
        if url in seen:
            continue
        seen.add(url)
        try:
            return await try_url(url)
        except Exception as e:
            last = e
            print(f"  (failed at {url}: {e})")
    print("ALL CANDIDATE PATHS FAILED:", last)
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
