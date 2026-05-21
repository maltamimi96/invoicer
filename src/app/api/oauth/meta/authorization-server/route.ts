/**
 * RFC 8414 authorization-server metadata. Advertises our OAuth endpoints to
 * MCP clients (claude.ai) so they can register, send the user to consent,
 * and exchange the code for a token.
 *
 * Public client + PKCE (S256), authorization_code grant only.
 */

function origin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.kireihq.com";
  return `${proto}://${host}`;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(req: Request) {
  const base = origin(req);
  return Response.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["admin"],
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
