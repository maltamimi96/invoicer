/**
 * Shared context for MCP tools.
 *
 * MCP requests authenticate with a per-business API key (`inv_*`), NOT a
 * cookie session — so we can't reuse the cookie-bound server actions
 * (they call getUser()). Instead every tool runs against the admin client
 * scoped manually by business_id, exactly like the /api/v1 REST routes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { expandApiScopes, type ApiScope } from "@/types/database";

export interface McpContext {
  businessId: string;
  userId: string;
  scopes: ApiScope[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any; // admin Supabase client (service role)
}

/** Throw if the key lacks the scope. `admin` satisfies everything. */
export function assertScope(ctx: McpContext, required: ApiScope): void {
  const effective = expandApiScopes(ctx.scopes);
  if (!effective.includes(required)) {
    throw new Error(
      `This API key is missing the "${required}" scope. Add it in Settings → API, or use an "admin" key.`
    );
  }
}

/**
 * Build the per-request context from the authenticated key info.
 *
 * `sb` is lazy on purpose. Every handler runs ctxFrom() then assertScope(), so
 * building the client eagerly meant a service-role client was constructed for
 * calls that were about to be denied — and, worse, that the denial couldn't
 * happen at all without Supabase env: createAdminClient() throws
 * "supabaseUrl is required" first, so a scope refusal surfaced as a config
 * error. The gate must not depend on the thing it's gating.
 */
export function buildContext(auth: {
  businessId: string;
  userId: string;
  scopes: ApiScope[];
}): McpContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  return {
    businessId: auth.businessId,
    userId: auth.userId,
    scopes: auth.scopes,
    get sb() {
      client ??= createAdminClient();
      return client;
    },
  };
}

/** Convenience table accessor mirroring the rest of the codebase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const t = (ctx: McpContext, name: string) => ctx.sb.from(name) as any;

/** Standard MCP text result. */
export function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text: body }] };
}

/** Standard MCP error result (isError so the model sees it failed). */
export function errorText(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}
