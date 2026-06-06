import { handleChat } from "../lib/chat/handler.js";
import { runAgent } from "../lib/chat/agent.js";
import { PERSONA } from "../lib/chat/persona.generated.js";
import { buildDeps } from "../lib/chat/deps.js";

const allowedOrigins = process.env.ALLOWED_ORIGINS ?? "*";
// I4: guard against NaN/negative/zero from a malformed env var
const parsed = parseInt(process.env.MAX_TOOL_ROUNDS ?? "", 10);
const maxRounds = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;

// model + search backend built once per cold-start from env vars.
// See lib/chat/deps.ts for the full env-var reference.
const { model, search } = buildDeps(process.env);

// Web Handler form (`{ fetch }`) so Vercel invokes this with a Web `Request`
// (req.headers.get(...)) instead of the legacy Node (req, res) signature.
// A bare `export default <fn>` is treated as the Node handler — see
// https://vercel.com/docs/functions/functions-api-reference#fetch-web-standard
export default {
  fetch: (req: Request): Promise<Response> =>
    handleChat(req, {
      runAgent,
      allowedOrigins,
      persona: PERSONA,
      model,
      search,
      maxRounds,
    }),
};
