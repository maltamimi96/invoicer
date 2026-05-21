/**
 * OAuth 2.1 token endpoint.
 *
 * Exchanges a one-time authorization code (+ PKCE verifier) for an access
 * token. The access token IS a freshly minted inv_* business API key with
 * admin scope — so the MCP route's authenticateApiKey() validates it with no
 * extra code. The key is also visible/revocable in Settings → API.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/api-auth";
import { createHash } from "crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function err(error: string, desc: string, status = 400): Response {
  return Response.json({ error, error_description: desc }, { status, headers: CORS });
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(req: Request): Promise<Response> {
  // Accept form-encoded (spec) or JSON.
  let params: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { params = await req.json(); } catch { return err("invalid_request", "Bad JSON body"); }
  } else {
    const form = await req.formData();
    form.forEach((v, k) => { params[k] = String(v); });
  }

  if (params.grant_type !== "authorization_code") {
    return err("unsupported_grant_type", "Only authorization_code is supported");
  }
  const { code, redirect_uri, client_id, code_verifier } = params;
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return err("invalid_request", "code, redirect_uri, client_id and code_verifier are required");
  }

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (sb as any).from("oauth_codes").select("*").eq("code", code).maybeSingle();
  if (!row) return err("invalid_grant", "Unknown or expired code");
  if (row.used) return err("invalid_grant", "Code already used");
  if (new Date(row.expires_at) < new Date()) return err("invalid_grant", "Code expired");
  if (row.client_id !== client_id) return err("invalid_grant", "client_id mismatch");
  if (row.redirect_uri !== redirect_uri) return err("invalid_grant", "redirect_uri mismatch");

  // PKCE S256 verification.
  const challenge = base64url(createHash("sha256").update(code_verifier).digest());
  if (challenge !== row.code_challenge) return err("invalid_grant", "PKCE verification failed");

  // Burn the code (single use).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("oauth_codes").update({ used: true }).eq("code", code);

  // Mint an inv_ admin key as the access token.
  const { key, prefix, hashPromise } = generateApiKey();
  const keyHash = await hashPromise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: keyErr } = await (sb as any).from("business_api_keys").insert({
    business_id: row.business_id,
    user_id: row.user_id,
    label: "Claude (claude.ai connector)",
    key_prefix: prefix,
    key_hash: keyHash,
    scopes: ["admin"],
  });
  if (keyErr) return err("server_error", keyErr.message, 500);

  return Response.json(
    {
      access_token: key,
      token_type: "Bearer",
      scope: "admin",
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
