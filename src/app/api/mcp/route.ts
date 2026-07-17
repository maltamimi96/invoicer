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
    // registerTools takes a ToolFn, not a server, so the same definitions can
    // also back the in-app assistant (see lib/mcp/collect.ts). Adapt onto the
    // real server here — this is the only place that knows about MCP.
    //
    // The cast covers the handler's `Promise<unknown>` vs the SDK's
    // `Promise<CallToolResult>`: handlers return text()/errorText(), which are
    // CallToolResult-shaped but typed loosely across ~200 tools. This used to
    // be a blanket `type McpServer = any` on the whole server, so narrowing it
    // to this one callback is a strict improvement in coverage.
    registerTools((name, description, shape, handler) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.tool(name, description, shape, handler as any)
    );
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
  {
    required: true,
    // 401s point clients here to discover the OAuth authorization server.
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  },
);

export { authed as GET, authed as POST, authed as DELETE };
