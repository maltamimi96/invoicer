/**
 * Signed, stateless "connect state" for outbound OAuth-ish connector flows
 * (GitHub App install, Google Search Console OAuth).
 *
 * The provider bounces the user's browser back to our callback; the state
 * proves the round trip belongs to a flow *we* started, binds it to the user
 * who started it (CSRF), and carries the site id through a provider that has
 * no idea what a Kirei site is. Stateless HMAC — nothing half-done is persisted.
 *
 * Server-only. Keyed by APP_ENCRYPTION_KEY, falling back to the GitHub App
 * private key so the GitHub flow keeps working on servers where the encryption
 * key isn't configured. States are short-lived (15 min), so re-keying only ever
 * costs an in-flight connect a retry.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ConnectState {
  /** Kirei user who started the flow — the callback must match. */
  u: string;
  /** seo_sites.id the connection belongs to. */
  s: string;
  /** Provider handle picked up on the return leg (GitHub installation id,
   *  Google refresh token) so a follow-up picker can be trusted. */
  i?: string;
  /** expiry (epoch seconds). */
  e: number;
}

const b64url = (b: Buffer | string) =>
  (Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8"))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function stateKey(): string {
  const k = process.env.APP_ENCRYPTION_KEY?.trim() || process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (!k) throw new Error("Connector flows need APP_ENCRYPTION_KEY set on the server.");
  return k;
}

export function signState(payload: Omit<ConnectState, "e">, ttlSeconds = 900): string {
  const body: ConnectState = { ...payload, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", stateKey()).update(data).digest());
  return `${data}.${sig}`;
}

/** Verify signature + expiry. Returns null on any tamper/expiry. */
export function verifyState(token: string | null | undefined): ConnectState | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  let expected: string;
  try { expected = b64url(createHmac("sha256", stateKey()).update(data).digest()); }
  catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as ConnectState;
    if (!parsed.u || !parsed.s || !parsed.e) return null;
    if (parsed.e < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
