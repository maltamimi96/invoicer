/**
 * Kirei MCP server — lets Claude Code (or any MCP client) drive the app
 * with a per-business API key.
 *
 * Connect from Claude Code:
 *   claude mcp add --transport http kirei https://www.kireihq.com/api/mcp \
 *     --header "Authorization: Bearer inv_xxxxxxxx"
 *
 * Auth: the same `inv_*` per-business keys managed in Settings → API.
 * Scopes on the key gate which tools are callable (an "admin" key gets all).
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { expandApiScopes } from "@/types/database";
import { registerTools } from "@/lib/mcp/register-tools";

export const maxDuration = 120;

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "kirei", version: "1.0.0" },
  },
  {
    // Stateless Streamable HTTP — no Redis session store needed.
    streamableHttpEndpoint: "/api/mcp",
    verboseLogs: false,
  },
);

// Validate the inv_* key and stash the business context for the tools to read
// via extra.authInfo.extra.
const authed = withMcpAuth(
  handler,
  async (req) => {
    const ctx = await authenticateApiKey(req as unknown as NextRequest);
    if (!ctx) return undefined; // 401
    return {
      token: "inv",
      clientId: ctx.businessId,
      scopes: expandApiScopes(ctx.scopes).map(String),
      extra: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        scopes: ctx.scopes,
      },
    };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
