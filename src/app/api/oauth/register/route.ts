/**
 * RFC 7591 Dynamic Client Registration.
 *
 * claude.ai POSTs its client metadata (name + redirect_uris); we store a
 * public client (no secret — PKCE) and return a client_id.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function POST(req: Request) {
  let body: {
    client_name?: string;
    redirect_uris?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: string]: any;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, { status: 400, headers: CORS });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string") : [];
  if (redirectUris.length === 0) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "At least one redirect_uri is required" }, { status: 400, headers: CORS });
  }

  const clientId = "mcp_" + randomBytes(16).toString("hex");
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).from("oauth_clients").insert({
    client_id: clientId,
    client_name: body.client_name ?? "MCP Client",
    redirect_uris: redirectUris,
  });
  if (error) {
    return Response.json({ error: "server_error", error_description: error.message }, { status: 500, headers: CORS });
  }

  return Response.json(
    {
      client_id: clientId,
      client_name: body.client_name ?? "MCP Client",
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
