---
title: AsyncAPI Knowledge MCP
emoji: 📘
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8000
pinned: false
license: mit
---

# AsyncAPI Knowledge MCP

A public [Model Context Protocol](https://modelcontextprotocol.io) server over the
AsyncAPI documentation + the AsyncAPI 3.1.0 JSON Schema, powered by
[OpenCrane](https://github.com/derberg/OpenCrane) (Milvus Lite + a local
`nomic-embed-text-v1.5` embedding model — no external AI API).

- **MCP endpoint:** `https://<owner>-asyncapi-knowledge-mcp.hf.space/http`
- **Health check:** `https://<owner>-asyncapi-knowledge-mcp.hf.space/health`

Content is rebuilt from [`derberg/asyncapi-knowledge-mcp`](https://github.com/derberg/asyncapi-knowledge-mcp)
at build time. Free CPU Basic hardware sleeps when idle and cold-starts (~10–30 s)
on the next request while the embedding model reloads.
