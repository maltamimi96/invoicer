/**
 * GitHub App plumbing for the one-click "Connect GitHub" publish flow.
 *
 * Why an App and not a PAT: the user clicks Connect → GitHub asks which repos to
 * grant → we get an installation_id back. No long-lived token is ever stored;
 * at publish time we mint a fresh installation access token (1h) from the App's
 * private key. The manual PAT form stays as a fallback for GitHub Enterprise or
 * when the App isn't installed.
 *
 * Server-only (reads the App private key, signs JWTs). Never import from a
 * client component.
 *
 * Env (all three required for the flow to light up):
 *   GITHUB_APP_ID                  — numeric App ID
 *   GITHUB_APP_SLUG                — url slug, for github.com/apps/<slug>
 *   GITHUB_APP_PRIVATE_KEY_BASE64  — base64 of the .pem (base64 avoids the
 *                                    multiline-newline mangling env vars suffer)
 */
import { createSign } from "node:crypto";

const GH_API = "https://api.github.com";
const UA = "Kirei-SEO";

function appId(): string | undefined {
  return process.env.GITHUB_APP_ID?.trim();
}

function appSlug(): string | undefined {
  return process.env.GITHUB_APP_SLUG?.trim();
}

/** The App private key as PEM. Stored base64-encoded to survive env plumbing. */
function privateKeyPem(): string | undefined {
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (!b64) return undefined;
  try {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    return pem.includes("PRIVATE KEY") ? pem : undefined;
  } catch {
    return undefined;
  }
}

/** True when the GitHub App is fully configured — gates the Connect button. */
export function githubAppConfigured(): boolean {
  return Boolean(appId() && appSlug() && privateKeyPem());
}

const b64url = (b: Buffer | string) =>
  (Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8"))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ── App JWT → installation token ─────────────────────────────────────────────

/** RS256 JWT signed with the App private key (GitHub allows max 10 min life). */
function mintAppJwt(): string {
  const pem = privateKeyPem();
  const id = appId();
  if (!pem || !id) throw new Error("GitHub App is not configured on this server.");
  const now = Math.floor(Date.now() / 1000);
  // iat back-dated 60s to tolerate clock skew; exp well under GitHub's 10-min cap.
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: id }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${b64url(signer.sign(pem))}`;
}

/** Installation tokens live 1h — cache in-process so a publish run doesn't
 *  re-mint per call. Keyed by installation id; refreshed 5 min before expiry. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function mintInstallationToken(installationId: string): Promise<string> {
  const hit = tokenCache.get(installationId);
  if (hit && hit.expiresAt - 5 * 60_000 > Date.now()) return hit.token;

  const res = await fetch(`${GH_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mintAppJwt()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    if (res.status === 404) throw new Error("The GitHub App install was removed — reconnect the repository.");
    throw new Error(`GitHub App token ${res.status}: ${body}`);
  }
  const j = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, { token: j.token, expiresAt: Date.parse(j.expires_at) });
  return j.token;
}

export interface InstallRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
}

/** Repos the user granted this installation. */
export async function listInstallationRepos(installationId: string): Promise<InstallRepo[]> {
  const token = await mintInstallationToken(installationId);
  const res = await fetch(`${GH_API}/installation/repositories?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
    },
  });
  if (!res.ok) throw new Error(`GitHub repositories ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { repositories?: InstallRepo[] };
  return (j.repositories ?? []).map((r) => ({
    full_name: r.full_name, default_branch: r.default_branch || "main", private: !!r.private,
  }));
}

// ── Install URL + signed state ───────────────────────────────────────────────

/** Where to send the browser to install/grant repos. GitHub forwards `state`
 *  to the App's Setup URL (our callback) after the user picks repos. */
export function installUrl(state: string): string {
  const slug = appSlug();
  if (!slug) throw new Error("GitHub App is not configured on this server.");
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

// Signed state lives in ./connect-state — shared with the Google Search
// Console flow. Re-exported so existing importers don't have to change.
export { signState, verifyState, type ConnectState } from "@/lib/seo/connect-state";
