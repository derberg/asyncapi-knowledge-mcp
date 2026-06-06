#!/usr/bin/env node
// Tiny local dev server — serves the same three things Vercel serves in
// production, without needing a Vercel account or `vercel dev`:
//
//   GET  /*            -> static files from chat/
//   ANY  /api/chat     -> api/chat.ts default export
//   ANY  /api/mcp      -> api/mcp.ts default export
//
// The api/ handlers are web-standard (Request) => Promise<Response>, so this
// just bridges Node's http server to them. Run via tsx (TS imports):
//
//   npx tsx scripts/dev-server.mjs          # PORT=7180 by default
//
// Used by scripts/run-local.sh; not part of the production deployment.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHAT_DIR = join(ROOT, "chat");
const PORT = Number.parseInt(process.env.PORT ?? "7180", 10);

// api/* export the Web Handler form `{ fetch }` (so Vercel uses Web Request).
const chatHandler = (await import("../api/chat.ts")).default.fetch;
const mcpHandler = (await import("../api/mcp.ts")).default.fetch;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Node IncomingMessage -> web Request
async function toRequest(req) {
  const url = `http://localhost:${PORT}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const chunks = [];
  if (hasBody) for await (const c of req) chunks.push(c);
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

// web Response -> Node ServerResponse (streams, so SSE responses work)
async function writeResponse(response, res) {
  const headers = {};
  for (const [k, v] of response.headers) headers[k] = v;
  res.writeHead(response.status, headers);
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = normalize(join(CHAT_DIR, rel));
  if (!file.startsWith(CHAT_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://x").pathname;
    if (pathname === "/api/chat") {
      await writeResponse(await chatHandler(await toRequest(req)), res);
    } else if (pathname === "/api/mcp") {
      await writeResponse(await mcpHandler(await toRequest(req)), res);
    } else if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
    } else {
      res.writeHead(405, { "content-type": "text/plain" }).end("method not allowed");
    }
  } catch (err) {
    console.error(`${req.method} ${req.url} failed:`, err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
});

server.listen(PORT, () => {
  console.log(`dev server listening on http://localhost:${PORT}`);
});
