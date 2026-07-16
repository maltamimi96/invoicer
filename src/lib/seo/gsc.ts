/**
 * Google Search Console connector (docs/SEO_AGENCY_PLAN.md Phase 2.2).
 *
 * Standard 3-legged OAuth: the user clicks Connect → consents at Google →
 * we exchange the code for a refresh token, store it encrypted, and mint
 * short-lived access tokens whenever we pull data.
 *
 * Deliberately NOT using `googleapis` — it's tens of megabytes and drags in the
 * whole discovery surface for what is three fetch calls. The repo already talks
 * to GitHub/WordPress/Sanity with plain fetch; this matches.
 *
 * Server-only. Env:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 * plus APP_ENCRYPTION_KEY (the refresh token is stored encrypted by the caller).
 *
 * ⚠️ Until the Google Cloud project passes sensitive-scope verification, the
 * consent screen stays in Testing mode and refresh tokens expire after 7 days —
 * users have to reconnect weekly. Verification removes that.
 */
import { appUrl } from "@/lib/app-url";

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const WMT = "https://www.googleapis.com/webmasters/v3";
/** Read-only Search Console. Sensitive scope — see the verification note above. */
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const clientId = () => process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = () => process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

/** True when the Google OAuth client is configured — gates the Connect button. */
export function gscConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** Must exactly match an Authorized redirect URI on the OAuth client. */
export function gscRedirectUri(): string {
  return `${appUrl() || "https://www.kireihq.com"}/api/seo/gsc/callback`;
}

export function gscAuthUrl(state: string): string {
  const id = clientId();
  if (!id) throw new Error("Google Search Console isn't set up on this server.");
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: gscRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    // offline + consent: Google only returns a refresh_token on the FIRST
    // consent unless we force the prompt — without this a reconnect silently
    // yields no refresh token and the connection dies at the next sync.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

/** Swap the one-time code for tokens. Returns the refresh token we persist. */
export async function exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const id = clientId(), secret = clientSecret();
  if (!id || !secret) throw new Error("Google Search Console isn't set up on this server.");
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: id, client_secret: secret,
      redirect_uri: gscRedirectUri(), grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!j.refresh_token) {
    throw new Error("Google didn't return a refresh token — revoke Kirei's access in your Google account and connect again.");
  }
  return { refreshToken: j.refresh_token, accessToken: j.access_token ?? "" };
}

/** Access tokens last ~1h — cache per refresh token, refresh 5 min early. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function accessTokenFor(refreshToken: string): Promise<string> {
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.expiresAt - 5 * 60_000 > Date.now()) return hit.token;

  const id = clientId(), secret = clientSecret();
  if (!id || !secret) throw new Error("Google Search Console isn't set up on this server.");
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    // invalid_grant = revoked, or the 7-day Testing-mode expiry bit us.
    if (res.status === 400 && body.includes("invalid_grant")) {
      throw new Error("Google access expired or was revoked — reconnect Search Console. (Unverified apps expire access every 7 days.)");
    }
    throw new Error(`Google token refresh ${res.status}: ${body}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(refreshToken, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

export interface GscProperty {
  siteUrl: string;          // "sc-domain:example.com" or "https://example.com/"
  permissionLevel: string;
}

/** Properties this Google account can see. */
export async function listProperties(accessToken: string): Promise<GscProperty[]> {
  const res = await fetch(`${WMT}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Search Console sites ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return (j.siteEntry ?? [])
    // siteUnverifiedUser can't query analytics — don't offer it.
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

export interface SearchRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** searchAnalytics.query. `dimensions` e.g. ["date","query"]. Dates YYYY-MM-DD. */
export async function querySearchAnalytics(
  accessToken: string, siteUrl: string,
  args: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number },
): Promise<SearchRow[]> {
  const res = await fetch(`${WMT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: args.startDate, endDate: args.endDate,
      dimensions: args.dimensions, rowLimit: args.rowLimit ?? 500, type: "web",
    }),
  });
  if (!res.ok) throw new Error(`Search Console query ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { rows?: SearchRow[] };
  return j.rows ?? [];
}

/** Best-guess match between a seo_sites.domain and the account's properties.
 *  domain is free-text and GSC has two property kinds, so this only pre-selects
 *  the picker — the user confirms, and we store the exact siteUrl they chose. */
export function guessProperty(domain: string, props: GscProperty[]): string | undefined {
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!host) return props[0]?.siteUrl;
  const norm = (s: string) => s.toLowerCase().replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
  return props.find((p) => norm(p.siteUrl) === host)?.siteUrl ?? props[0]?.siteUrl;
}
