# Deploy to Vercel (one-time setup)

This document describes the one-time setup needed to get the **chat website**
(`derberg/asyncapi-knowledge-mcp`) running on Vercel. Vercel hosts ONLY the chat —
the public MCP server lives on a
[Hugging Face Docker Space](https://huggingface.co/spaces/derberg/asyncapi-knowledge-mcp)
and the local path is the PyPI package.

## 1. Create the Vercel project

Option A — via the Vercel CLI:

    vercel link   # follow prompts; choose "create new project"; name it asyncapi-knowledge-mcp

Option B — via the Vercel dashboard:
1. Go to https://vercel.com/new
2. Import `derberg/asyncapi-knowledge-mcp` from GitHub.
3. Framework preset: **Other** (the repo ships `vercel.json` with `"framework": null`).
4. Leave Build Command and Output Directory at their defaults (`vercel.json` sets them).
5. Click **Deploy**.

`vercel.json` already configures the project correctly:

```json
{
  "framework": null,
  "buildCommand": "",
  "outputDirectory": "chat"
}
```

## 2. Set the environment variables

In the Vercel project settings (Settings → Environment Variables), add:

| Name | Value | Environments |
|---|---|---|
| `AI_GATEWAY_API_KEY` | your Vercel AI Gateway key | Production, Preview, Development |
| `SEARCH_MCP_URL` | `https://derberg-asyncapi-knowledge-mcp.hf.space/http` | Production, Preview, Development |
| `ALLOWED_ORIGINS` | the production site origin (NOT `*`) | Production |

`AI_GATEWAY_API_KEY` is used by `api/chat.ts` for inference (`gpt-5-nano`).
`SEARCH_MCP_URL` points the chat's `search_docs` tool at the Hugging Face Space —
**required**; there is no in-process search fallback.

## 3. Enable git auto-deploy

Vercel enables auto-deploy on the default branch (`main`) by default. No extra configuration
is needed — every push to `main` triggers a new production deployment automatically.

## 4. Verify the deployment

Once Vercel has deployed:

    # chat function
    curl -s -X POST https://<your-domain>/api/chat \
      -H 'content-type: application/json' \
      -d '{"messages":[{"role":"user","content":"What is AsyncAPI?"}]}'

    # the MCP backend it depends on (Hugging Face Space)
    curl -s https://derberg-asyncapi-knowledge-mcp.hf.space/health
    MCP_URL=https://derberg-asyncapi-knowledge-mcp.hf.space/http uv run --with mcp python tests/smoke_http.py

> The free Space hardware sleeps when idle — the first request after a quiet spell
> cold-starts in ~10–30 s, and the chat may report a failed search during that window.

## 5. Custom domain (optional)

In the Vercel project settings, go to Domains and add a custom domain. After DNS propagates,
set `ALLOWED_ORIGINS` to the new origin.

## GitHub repository secrets (separate)

| Secret | Used by | Purpose |
|---|---|---|
| `HF_TOKEN` | `publish-pypi.yml` (bump-pins job) | Push the re-pinned `space/` files to the Hugging Face Space after a release. Write-scoped HF access token. |

The weekly refresh needs **no secrets** — OpenCrane embeds with a local model.

## PyPI trusted publishing setup (separate)

Publishing to PyPI via `publish-pypi.yml` requires a one-time trusted publisher setup on
pypi.org:

1. Go to https://pypi.org → Account settings → Publishing → Add a new pending publisher.
2. Project name: `asyncapi-knowledge-mcp`
3. GitHub repository owner: `derberg`
4. GitHub repository name: `asyncapi-knowledge-mcp`
5. Workflow filename: `publish-pypi.yml`
6. Environment: *(leave blank)*

After the first release, the package will appear at https://pypi.org/project/asyncapi-knowledge-mcp/.
