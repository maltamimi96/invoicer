/**
 * Shared plumbing for the MCP tool modules.
 *
 * register-tools.ts is the entry point (registerTools) and still holds the bulk
 * of the tools; churned/newer domains are peeled into sibling files under
 * ./tools that each export a register<Domain>Tools(tool) function. These are the
 * few helpers those files (and the main file) share, so there's one source of
 * truth for context extraction, the UUID schema, the app base URL, and portal
 * token minting.
 */
import { z } from "zod";
import { randomBytes } from "crypto";
import { buildContext, t, type McpContext } from "../context";
import type { ApiScope } from "@/types/database";

/**
 * The thin registration helper each tool module receives. Mirrors the closure
 * defined in registerTools: (name, description, zod shape, handler). Handlers
 * are wrapped there for uniform error handling, so the return value is ignored.
 */
export type ToolFn = (
  name: string,
  description: string,
  shape: z.ZodRawShape,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, extra: any) => Promise<unknown>,
) => void;

interface AuthExtra {
  businessId: string;
  userId: string;
  scopes: ApiScope[];
}

/** Build the business-scoped context from the authenticated API key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ctxFrom(extra: any): McpContext {
  const auth = extra?.authInfo?.extra as AuthExtra | undefined;
  if (!auth?.businessId) throw new Error("Unauthorized — no business context on the API key");
  return buildContext(auth);
}

export const appBase = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.kireihq.com").replace(/\/$/, "");

export const UUID = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "must be a UUID");

/** Reuse or mint a 90-day portal token for a customer. */
export async function getOrMintPortalToken(ctx: McpContext, customerId: string): Promise<string> {
  const { data: existing } = await t(ctx, "customer_portal_tokens")
    .select("token")
    .eq("business_id", ctx.businessId)
    .eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const token = "cust_" + randomBytes(24).toString("hex");
  await t(ctx, "customer_portal_tokens").insert({
    token, business_id: ctx.businessId, customer_id: customerId,
    created_by: ctx.userId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  return token;
}
