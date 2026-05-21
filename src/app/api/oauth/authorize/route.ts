/**
 * OAuth 2.1 authorization endpoint for the MCP server.
 *
 *  GET  — validate the request, require a kireihq.com login, then render a
 *         consent screen where the signed-in user picks which business to
 *         expose and clicks Allow.
 *  POST — (from the consent form) mint a one-time authorization code bound to
 *         {client, business, user, redirect_uri, PKCE challenge} and redirect
 *         back to the client with ?code=&state=.
 *
 * No client secret — public client + PKCE (S256), verified at the token
 * endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

interface AuthzParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  scope: string;
  response_type: string;
}

function readParams(sp: URLSearchParams): AuthzParams {
  return {
    client_id: sp.get("client_id") ?? "",
    redirect_uri: sp.get("redirect_uri") ?? "",
    code_challenge: sp.get("code_challenge") ?? "",
    code_challenge_method: sp.get("code_challenge_method") ?? "",
    state: sp.get("state") ?? "",
    scope: sp.get("scope") ?? "admin",
    response_type: sp.get("response_type") ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateClient(sb: any, clientId: string, redirectUri: string): Promise<string | null> {
  const { data } = await sb.from("oauth_clients").select("redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!data) return "Unknown client_id";
  if (!Array.isArray(data.redirect_uris) || !data.redirect_uris.includes(redirectUri)) return "redirect_uri not registered for this client";
  return null;
}

/** List businesses the signed-in user can expose (owned + active member of). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listBusinesses(sb: any, userId: string): Promise<Array<{ id: string; name: string }>> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    sb.from("businesses").select("id, name").eq("user_id", userId),
    sb.from("business_members").select("business_id, businesses(id, name)").eq("user_id", userId).eq("status", "active"),
  ]);
  const map = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (owned ?? []).forEach((b: any) => map.set(b.id, b.name));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (memberships ?? []).forEach((m: any) => { if (m.businesses) map.set(m.businesses.id, m.businesses.name); });
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function errorRedirect(redirectUri: string, state: string, error: string, desc: string): NextResponse {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", desc);
  if (state) u.searchParams.set("state", state);
  return NextResponse.redirect(u.toString());
}

export async function GET(req: NextRequest) {
  const p = readParams(req.nextUrl.searchParams);
  const sb = createAdminClient();

  // Basic protocol validation (render a plain page on hard errors so we don't
  // bounce to an unvalidated redirect_uri).
  if (p.response_type !== "code" || p.code_challenge_method !== "S256" || !p.client_id || !p.redirect_uri || !p.code_challenge) {
    return new NextResponse("Invalid authorization request (need response_type=code, code_challenge_method=S256, client_id, redirect_uri, code_challenge).", { status: 400 });
  }
  const clientErr = await validateClient(sb, p.client_id, p.redirect_uri);
  if (clientErr) return new NextResponse(clientErr, { status: 400 });

  // Require a signed-in user. If not logged in, send them to login and come back.
  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) {
    const next = `/api/oauth/authorize${req.nextUrl.search}`;
    const loginUrl = new URL("/auth/login", req.nextUrl.origin);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl.toString());
  }

  const businesses = await listBusinesses(cookieClient, user.id);
  if (businesses.length === 0) {
    return new NextResponse("Your account has no businesses to connect.", { status: 400 });
  }

  // Consent screen — pick a business + Allow. POSTs back to this same endpoint.
  const options = businesses.map((b, i) =>
    `<label class="biz"><input type="radio" name="business_id" value="${esc(b.id)}" ${i === 0 ? "checked" : ""}/> <span>${esc(b.name)}</span></label>`
  ).join("");

  const hidden = Object.entries({
    client_id: p.client_id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge,
    code_challenge_method: p.code_challenge_method, state: p.state, scope: p.scope, response_type: p.response_type,
  }).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}"/>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Connect to Kirei</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#fafaf7;color:#1a1a17;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border:1px solid #e5e3d9;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);max-width:420px;width:100%;padding:28px}
  .logo{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#3a847e,#1f4f4a);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 6px}
  p{color:#6b6b63;font-size:14px;margin:0 0 20px;line-height:1.5}
  .biz{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #e5e3d9;border-radius:10px;margin-bottom:8px;cursor:pointer;font-size:15px}
  .biz:hover{background:#f5f5f0}
  .actions{display:flex;gap:10px;margin-top:20px}
  button{flex:1;padding:12px;border-radius:10px;border:0;font-size:15px;font-weight:600;cursor:pointer}
  .allow{background:linear-gradient(135deg,#3a847e,#1f4f4a);color:#fff}
  .deny{background:#f0efe9;color:#1a1a17}
  .scope{font-size:12px;color:#9a9a90;margin-top:16px}
</style></head>
<body><div class="card">
  <div class="logo">K</div>
  <h1>Connect to Claude</h1>
  <p>Claude is requesting access to operate one of your Kirei businesses — read &amp; create customers, quotes, invoices, tasks, send emails and edit settings.</p>
  <form method="POST">
    ${hidden}
    ${options}
    <div class="actions">
      <button class="deny" type="submit" name="decision" value="deny">Cancel</button>
      <button class="allow" type="submit" name="decision" value="allow">Allow</button>
    </div>
    <div class="scope">Full admin access · You can revoke this anytime in Settings → API.</div>
  </form>
</div></body></html>`;

  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const get = (k: string) => String(form.get(k) ?? "");
  const p: AuthzParams = {
    client_id: get("client_id"), redirect_uri: get("redirect_uri"), code_challenge: get("code_challenge"),
    code_challenge_method: get("code_challenge_method"), state: get("state"), scope: get("scope") || "admin",
    response_type: get("response_type") || "code",
  };
  const decision = get("decision");
  const businessId = get("business_id");

  const sb = createAdminClient();
  const clientErr = await validateClient(sb, p.client_id, p.redirect_uri);
  if (clientErr) return new NextResponse(clientErr, { status: 400 });

  if (decision !== "allow") {
    return errorRedirect(p.redirect_uri, p.state, "access_denied", "User denied the request");
  }

  // Re-check the session and that the chosen business belongs to the user.
  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (!user) return errorRedirect(p.redirect_uri, p.state, "access_denied", "Not signed in");
  const businesses = await listBusinesses(cookieClient, user.id);
  if (!businesses.some((b) => b.id === businessId)) {
    return errorRedirect(p.redirect_uri, p.state, "access_denied", "Business not available to this user");
  }

  // Mint a one-time code (10 min TTL).
  const code = "code_" + randomBytes(24).toString("hex");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).from("oauth_codes").insert({
    code, client_id: p.client_id, business_id: businessId, user_id: user.id,
    redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, scope: "admin",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return errorRedirect(p.redirect_uri, p.state, "server_error", error.message);

  const u = new URL(p.redirect_uri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  return NextResponse.redirect(u.toString(), { status: 303 });
}
