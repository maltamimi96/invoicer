"use server";

/**
 * SEO connector connections — save / list / delete (docs/SEO_AGENCY_PLAN.md).
 *
 * Secrets (tokens/keys) are split out of the config, encrypted as one blob into
 * seo_connections.secret, and NEVER returned to the client. Non-secret config
 * lives in meta and is safe to show. RLS gates writes to owner/admin/editor.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import { testConnection } from "@/lib/seo/publish";
import { CONNECTORS_BY_ID, secretFieldKeys, type ConnectionView } from "@/lib/seo/connectors";
import {
  githubAppConfigured, installUrl, listInstallationRepos,
} from "@/lib/seo/github-app";
import { signState, verifyState } from "@/lib/seo/connect-state";
import { gscConfigured, gscAuthUrl, accessTokenFor, listProperties } from "@/lib/seo/gsc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function biz(): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  return getActiveBizId(supabase, user.id);
}

/** A human identifier to show on the connection card. */
function accountRef(provider: string, meta: Record<string, string>): string | null {
  switch (provider) {
    case "git-github": return meta.repo ?? null;
    case "gsc": return meta.site_url ?? null;
    case "wordpress": return meta.site_url ?? null;
    case "sanity": return meta.project_id ? `${meta.project_id}/${meta.dataset ?? ""}` : null;
    case "payload": return meta.base_url ?? null;
    case "rest":
    case "graphql": return meta.endpoint ?? null;
    default: return null;
  }
}

/** Connections for a site — secrets redacted. */
export async function listConnections(siteId: string): Promise<ConnectionView[]> {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_connections")
    .select("id, provider, label, status, account_ref, connected_at, meta, secret")
    .eq("business_id", businessId).eq("site_id", siteId).order("created_at", { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, provider: r.provider, label: r.label, status: r.status,
    account_ref: r.account_ref, connected_at: r.connected_at,
    meta: (r.meta ?? {}) as Record<string, string>, hasSecret: !!r.secret,
  }));
}

export async function saveConnection(input: {
  site_id: string;
  provider: string;
  values: Record<string, string>;
  connection_id?: string;
  label?: string;
}): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const def = CONNECTORS_BY_ID[input.provider];
  if (!def) throw new Error(`Unknown connector "${input.provider}"`);

  const secretKeys = new Set(secretFieldKeys(def));
  const meta: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.values)) {
    if (v == null || v === "") continue;
    if (secretKeys.has(k)) secrets[k] = v; else meta[k] = v;
  }
  // Fill non-secret defaults.
  for (const f of def.fields) {
    if (!f.secret && meta[f.key] == null && f.default) meta[f.key] = f.default;
  }
  // Required non-secret validation.
  for (const f of def.fields) {
    if (f.required && !f.secret && !meta[f.key]) throw new Error(`${f.label} is required`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    business_id: businessId, site_id: input.site_id, provider: input.provider,
    label: input.label?.trim() || def.name, meta,
    status: "connected", account_ref: accountRef(input.provider, meta),
    connected_at: new Date().toISOString(),
  };
  if (Object.keys(secrets).length > 0) {
    if (!encryptionAvailable()) throw new Error("Credential storage needs APP_ENCRYPTION_KEY set on the server.");
    row.secret = encryptSecret(JSON.stringify(secrets));
  } else if (!input.connection_id) {
    // New connection with a required secret but none provided.
    const needsSecret = def.fields.some((f) => f.secret && f.required);
    if (needsSecret) throw new Error("A credential is required to connect.");
  }

  if (input.connection_id) {
    const { error } = await tbl(supabase, "seo_connections").update(row).eq("id", input.connection_id).eq("business_id", businessId);
    if (error) throw error;
  } else {
    const { error } = await tbl(supabase, "seo_connections").insert(row);
    if (error) throw error;
  }
  revalidatePath(`/seo/${input.site_id}`);
}

/** Verify a connection's credentials against the gateway. */
export async function testSeoConnection(connectionId: string): Promise<{ ok: boolean; message: string }> {
  const businessId = await biz();
  return testConnection(createAdminClient(), businessId, connectionId);
}

export async function deleteConnection(connectionId: string, siteId: string): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const { error } = await tbl(supabase, "seo_connections").delete().eq("id", connectionId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/seo/${siteId}`);
}

// ── GitHub App one-click connect ─────────────────────────────────────────────
// The manual token form above still works; this is the nicer path. Credential
// handling stays server-side (the App private key mints short-lived tokens), so
// the web-UI-only rule for connecting is preserved — no MCP tool for this.

/** True when the server has a GitHub App configured (drives the Connect button). */
export async function isGithubAppConfigured(): Promise<boolean> {
  return githubAppConfigured();
}

/** Where to send the browser to install the App / grant repos. State binds the
 *  flow to this user + site so the callback can't be forged or replayed. */
export async function getGithubConnectUrl(siteId: string): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  // Confirms the site belongs to the active business (RLS-scoped read).
  const businessId = await getActiveBizId(supabase, user.id);
  const { data: site } = await tbl(supabase, "seo_sites")
    .select("id").eq("id", siteId).eq("business_id", businessId).maybeSingle();
  if (!site) throw new Error("Site not found");
  if (!githubAppConfigured()) throw new Error("The GitHub App isn't set up on this server yet.");
  return installUrl(signState({ u: user.id, s: siteId }));
}

/** Repos granted to an installation — for the picker when the user granted more
 *  than one. `token` is the signed state handed back by the callback, so a user
 *  can't enumerate an installation they didn't just connect. */
export async function listGithubRepos(token: string): Promise<{ full_name: string; default_branch: string; private: boolean }[]> {
  const user = await getUser();
  const state = verifyState(token);
  if (!state || state.u !== user.id) throw new Error("This connect link has expired — start again.");
  if (!state.i) throw new Error("Missing installation");
  return listInstallationRepos(state.i);
}

/** Create the connection once a repo is chosen (or auto-picked by the callback). */
export async function finalizeGithubConnection(input: {
  token: string;            // signed state from the callback (carries user/site/installation)
  repo: string;             // owner/repo
  branch?: string;
  content_path?: string;
  extension?: string;
}): Promise<{ site_id: string }> {
  const businessId = await biz();
  const user = await getUser();
  const supabase = await createClient();

  const state = verifyState(input.token);
  if (!state || state.u !== user.id) throw new Error("This connect link has expired — start again.");
  if (!state.i) throw new Error("Missing installation");
  const installationId = state.i;

  // Only repos this installation actually granted — stops a forged repo string.
  const repos = await listInstallationRepos(installationId);
  const chosen = repos.find((r) => r.full_name === input.repo);
  if (!chosen) throw new Error("That repository isn't part of this GitHub App installation.");

  const def = CONNECTORS_BY_ID["git-github"];
  const meta: Record<string, string> = {
    repo: chosen.full_name,
    branch: input.branch?.trim() || chosen.default_branch || "main",
    content_path: input.content_path?.trim() || "src/content/blog",
    extension: input.extension?.trim() || "md",
    installation_id: installationId,
  };

  // No `secret` column write: the App mints tokens on demand, so App-mode
  // connections work even without APP_ENCRYPTION_KEY configured.
  const { error } = await tbl(supabase, "seo_connections").insert({
    business_id: businessId, site_id: state.s, provider: "git-github",
    label: def?.name ?? "Git (GitHub)", meta,
    status: "connected", account_ref: chosen.full_name,
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath(`/seo/${state.s}`);
  return { site_id: state.s };
}

// ── Google Search Console (OAuth) ────────────────────────────────────────────
// Unlike GitHub (App-minted tokens), GSC gives us a refresh token we must
// persist — so this path DOES need APP_ENCRYPTION_KEY. Connecting stays
// web-UI-only: no MCP tool, and the token never reaches the client.

/** True when the server has a Google OAuth client configured. */
export async function isGscConfigured(): Promise<boolean> {
  return gscConfigured();
}

export async function getGscConnectUrl(siteId: string): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data: site } = await tbl(supabase, "seo_sites")
    .select("id").eq("id", siteId).eq("business_id", businessId).maybeSingle();
  if (!site) throw new Error("Site not found");
  if (!gscConfigured()) throw new Error("Google Search Console isn't set up on this server yet.");
  // Fail loudly here rather than after the user has consented at Google.
  if (!encryptionAvailable()) throw new Error("Credential storage needs APP_ENCRYPTION_KEY set on the server.");
  return gscAuthUrl(signState({ u: user.id, s: siteId }));
}

/** Properties on the just-connected Google account (for the picker). The signed
 *  state carries the refresh token, so a user can't enumerate someone else's. */
export async function listGscProperties(token: string): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const user = await getUser();
  const state = verifyState(token);
  if (!state || state.u !== user.id) throw new Error("This connect link has expired — start again.");
  if (!state.i) throw new Error("Missing Google credentials");
  return listProperties(await accessTokenFor(state.i));
}

/** Persist the chosen property + its refresh token (encrypted). */
export async function finalizeGscConnection(input: { token: string; site_url: string }): Promise<{ site_id: string }> {
  const businessId = await biz();
  const user = await getUser();
  const supabase = await createClient();

  const state = verifyState(input.token);
  if (!state || state.u !== user.id) throw new Error("This connect link has expired — start again.");
  if (!state.i) throw new Error("Missing Google credentials");
  if (!encryptionAvailable()) throw new Error("Credential storage needs APP_ENCRYPTION_KEY set on the server.");

  // Only properties this Google account actually has — blocks a forged site_url.
  const props = await listProperties(await accessTokenFor(state.i));
  const chosen = props.find((p) => p.siteUrl === input.site_url);
  if (!chosen) throw new Error("That property isn't available on the connected Google account.");

  const def = CONNECTORS_BY_ID["gsc"];
  const meta: Record<string, string> = { site_url: chosen.siteUrl, permission_level: chosen.permissionLevel };

  // One GSC connection per site — replace rather than stack duplicates.
  await tbl(supabase, "seo_connections")
    .delete().eq("business_id", businessId).eq("site_id", state.s).eq("provider", "gsc");

  const { error } = await tbl(supabase, "seo_connections").insert({
    business_id: businessId, site_id: state.s, provider: "gsc",
    label: def?.name ?? "Google Search Console", meta,
    status: "connected", account_ref: chosen.siteUrl,
    connected_at: new Date().toISOString(),
    secret: encryptSecret(JSON.stringify({ refresh_token: state.i })),
  });
  if (error) throw error;
  revalidatePath(`/seo/${state.s}`);
  return { site_id: state.s };
}

/** Top queries for the Search performance tab, from synced snapshots. */
export async function getSearchPerformance(siteId: string, days = 28): Promise<{
  rows: { keyword: string; position: number | null; clicks: number; impressions: number; ctr: number | null }[];
  totals: { clicks: number; impressions: number; keywords: number };
  lastSynced: string | null;
}> {
  const businessId = await biz();
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString().split("T")[0];
  const { data } = await tbl(supabase, "seo_keyword_snapshots")
    .select("keyword, position, clicks, impressions, ctr, captured_at")
    .eq("business_id", businessId).eq("site_id", siteId).gte("captured_at", since)
    .order("captured_at", { ascending: false }).limit(5000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (data ?? []) as any[];
  // Latest snapshot per keyword = "where it stands now"; clicks/impressions sum
  // across the window.
  const byKeyword = new Map<string, { keyword: string; position: number | null; clicks: number; impressions: number; ctr: number | null }>();
  for (const r of all) {
    const k = String(r.keyword);
    const hit = byKeyword.get(k);
    if (!hit) {
      byKeyword.set(k, {
        keyword: k, position: r.position == null ? null : Number(r.position),
        clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0),
        ctr: r.ctr == null ? null : Number(r.ctr),
      });
    } else {
      hit.clicks += Number(r.clicks ?? 0);
      hit.impressions += Number(r.impressions ?? 0);
    }
  }
  const rows = [...byKeyword.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 200);
  return {
    rows,
    totals: {
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      impressions: rows.reduce((s, r) => s + r.impressions, 0),
      keywords: byKeyword.size,
    },
    lastSynced: all[0]?.captured_at ?? null,
  };
}
