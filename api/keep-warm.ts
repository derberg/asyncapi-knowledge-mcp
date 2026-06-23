// Cron-triggered keep-warm ping for the Hugging Face Space.
//
// Free HF Spaces sleep after inactivity and cold-start (~30s) on the next
// request, which can blow past client timeouts and make the MCP search look
// dead. A periodic GET to /health keeps the Space awake. Scheduled from
// vercel.json `crons`. See README "Hosted MCP server".
//
// Env:
//   SEARCH_MCP_URL — REQUIRED in prod (e.g. https://…hf.space/http). The
//                    health URL is derived by swapping the trailing /http.
//   CRON_SECRET    — OPTIONAL. If set, Vercel sends it as
//                    `Authorization: Bearer <secret>`; we reject other callers.

const HEALTH_TIMEOUT_MS = 60_000; // generous: a cold start can take ~30s+

function healthUrl(): string {
  const mcpUrl = process.env.SEARCH_MCP_URL;
  if (!mcpUrl) {
    throw new Error(
      "SEARCH_MCP_URL is required to derive the keep-warm health endpoint.",
    );
  }
  // …/http -> …/health (covers trailing slash too)
  return mcpUrl.replace(/\/http\/?$/, "/health");
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = healthUrl();
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        headers: { "user-agent": "vercel-cron-keep-warm" },
      });
      const body = await res.text();
      const elapsedMs = Date.now() - start;
      return Response.json({
        ok: res.ok,
        upstreamStatus: res.status,
        elapsedMs,
        body: body.slice(0, 500),
      });
    } catch (err) {
      const elapsedMs = Date.now() - start;
      return Response.json(
        { ok: false, elapsedMs, error: String(err) },
        { status: 502 },
      );
    }
  },
};
