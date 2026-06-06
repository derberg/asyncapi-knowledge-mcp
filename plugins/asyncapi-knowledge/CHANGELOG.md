# Changelog

## 0.2.0

- The MCP server now runs fully locally via the PyPI package (`uvx asyncapi-knowledge-mcp`,
  stdio transport, bundled vector index — no API keys, no remote calls) instead of the
  hosted HTTP endpoint. Requires `uv` to be installed.

## 0.1.0

- Initial release: `asyncapi-researcher` agent + `asyncapi-knowledge` MCP server registration.
