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
