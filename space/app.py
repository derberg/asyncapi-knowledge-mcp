"""HTTP entrypoint for the bundled AsyncAPI knowledge MCP server.

The `asyncapi-knowledge-mcp` PyPI package (produced by `opencrane pack`) bundles
the prebuilt `milvus.db` + `chunks.json` inside its module and exposes a stdio
console script. Hugging Face Spaces need an HTTP server, so we point OpenCrane at
that bundled data (the same env vars the package's own entrypoint sets) and start
the HTTP transport on $MCP_HTTP_PORT.
"""
import asyncio
import importlib.util
import os
from pathlib import Path

spec = importlib.util.find_spec("asyncapi_knowledge_mcp")
if spec is None or spec.origin is None:  # pragma: no cover
    raise SystemExit("asyncapi_knowledge_mcp package not found")

data_dir = Path(spec.origin).parent / "data"
os.environ.setdefault("MILVUS_DB_PATH", str(data_dir / "milvus.db"))
os.environ.setdefault("AI_DOCS_CHUNKS_FILE", str(data_dir / "chunks.json"))

from opencrane.mcp.http_server import main  # noqa: E402  (after env is set)

asyncio.run(main())
