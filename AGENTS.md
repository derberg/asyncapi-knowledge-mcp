# asyncapi-knowledge-mcp — Agent Instructions

AI-powered documentation search for AsyncAPI, built with OpenCrane. An OpenCrane pipeline indexes the AsyncAPI docs and JSON Schema into committed artifacts (`.opencrane/chunks.json` + LFS-tracked `embeddings.json`/`milvus.db`) served as a public MCP server two ways: a Hugging Face Docker Space (`space/`) and the `asyncapi-knowledge-mcp` PyPI package. A Claude plugin (`plugins/asyncapi-knowledge`) wires the PyPI server into Claude Code, and a static chat UI (`chat/` + `api/chat.ts`, hosted on Vercel) searches through the Space. Licensed under MIT.

## Authorship Rules

- **NEVER add `Co-Authored-By:` with yourself as a co-author of any commit.** Agents are assistants and tools — they are not authors. Only humans can be authors of commits.
- AI assistance disclosure belongs in the pull request description using the exact format below — not in commit authorship metadata:
  ```
  Generated-by: <Agent Name and Version>
  ```

## Commit Conventions

- Use conventional commits: `feat:`, `fix:`, `docs:`, `ci:`, `chore:`
- This project is MIT-licensed — do not introduce incompatibly licensed material

## Running Tests

Root (Vitest + TypeScript type-check):

```bash
npm test
npx tsc --noEmit
```

MCP HTTP smoke test (against the public Hugging Face Space by default):

```bash
uv run --with mcp python tests/smoke_http.py
# Override endpoint: MCP_URL=http://localhost:8000/http uv run --with mcp python tests/smoke_http.py
```

PyPI / stdio smoke test (needs a built opencrane index with `uvx opencrane embed && uvx opencrane index`):

```bash
MILVUS_DB_PATH=.opencrane/milvus.db uv run --with mcp python tests/smoke_query.py
```

## Key Conventions — Do Not Quietly Undo

- **The agent persona lives in `agent/asyncapi-researcher.md`.** It is synced into the plugin
  with `scripts/sync-agent.sh`; CI fails if the two copies drift. Edit the source, then sync —
  never edit the plugin copy (`plugins/asyncapi-knowledge/agents/asyncapi-researcher.md`)
  directly. A `PostToolUse` hook in `.claude/settings.json` runs the sync automatically after
  any edit to either file (a direct edit to the plugin copy gets overwritten by the source).
  The `<!-- SOURCE-NOTE -->` block in the source file explains this and is stripped from all
  generated outputs.
- **The persona is also bundled into `lib/chat/persona.generated.ts`** by
  `scripts/bundle-persona.mjs`. CI runs this script and checks `git diff --exit-code` — so
  `lib/chat/persona.generated.ts` must always match `agent/asyncapi-researcher.md`. Never edit
  `persona.generated.ts` directly; always edit the source and re-run the bundle script.
- **`.opencrane/embeddings.json` and `.opencrane/milvus.db` are committed via Git LFS.**
  They are the search index consumed by the PyPI package and the Hugging Face Space.
  The weekly refresh regenerates them with OpenCrane's LOCAL embedding model (no API keys)
  ONLY when `chunks.json` changed. There is no Vercel-side vector index — the chat searches
  through the Space's MCP endpoint (`SEARCH_MCP_URL`).
- **Content delivery does NOT require a release.** The weekly refresh workflow commits
  updated content to `main`; Vercel auto-deploys on every push. Releases gate the PyPI
  package publish only (`publish-pypi.yml`) — never wire content deploys to the release event.
- **No deploy workflows.** Vercel auto-deploys on push to `main`. There are no
  `deploy-*.yml` workflows; the refresh commit IS the deploy trigger.
