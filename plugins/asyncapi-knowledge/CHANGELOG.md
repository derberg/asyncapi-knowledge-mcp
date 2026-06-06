# Changelog

## 0.2.0

- The MCP server now runs fully locally via the PyPI package (`uvx asyncapi-knowledge-mcp`,
  stdio transport, bundled vector index — no API keys, no remote calls) instead of the
  hosted HTTP endpoint. Requires `uv` to be installed.
- The package version is pinned (`==0.0.2`) — never an implicit "latest" — for
  supply-chain safety. Plugin releases bump the pin deliberately.
- The agent persona now covers the local server's extra tools: `get_yaml_definition`
  (full JSON Schema definitions), `get_list_members`, `get_metadata_schema`.

## 0.1.0

- Initial release: `asyncapi-researcher` agent + `asyncapi-knowledge` MCP server registration.
