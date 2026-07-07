"use server";

/**
 * SEO Production — client-site management (docs/SEO_AGENCY_PLAN.md, Phase 2).
 *
 * First usable slice: an agency registers the client sites it works on. The
 * connectors (GSC etc.), opportunity scout, content pipeline and job engine
 * land in later PRs and hang off these sites. AI-tool-first: every action here
 * has a matching MCP tool in register-tools (scopes seo:read / seo:write).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { SeoSite, SeoPlatform, SeoPlaybook, SeoSiteStatus } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uid = (v: string | null | undefined) => (v && UUID_RE.test(v.trim()) ? v.trim() : null);

// seo_* tables aren't in the hand-maintained Database type yet — same escape
// hatch the other recent actions use (forms.ts / onboarding.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

/** Normalise a domain input to a bare host (strip scheme, path, trailing slash). */
function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0];
  return d.replace(/\/+$/, "");
}

export async function listSeoSites(): Promise<SeoSite[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "seo_sites")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeoSite[];
}

export async function getSeoSite(siteId: string): Promise<SeoSite | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "seo_sites")
    .select("*")
    .eq("id", siteId)
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as SeoSite) ?? null;
}

export async function createSeoSite(input: {
  domain: string;
  customer_id?: string | null;
  platform?: SeoPlatform;
  playbook?: SeoPlaybook;
  notes?: string | null;
}): Promise<SeoSite> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const domain = normalizeDomain(input.domain);
  if (!domain) throw new Error("A domain is required");

  const { data, error } = await tbl(supabase, "seo_sites")
    .insert({
      business_id: businessId,
      customer_id: uid(input.customer_id),
      domain,
      platform: input.platform ?? "other",
      playbook: input.playbook ?? "local",
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/seo");
  return data as SeoSite;
}

export async function updateSeoSite(
  siteId: string,
  patch: {
    domain?: string;
    customer_id?: string | null;
    platform?: SeoPlatform;
    playbook?: SeoPlaybook;
    status?: SeoSiteStatus;
    notes?: string | null;
  },
): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const clean: Record<string, unknown> = {};
  if (patch.domain !== undefined) clean.domain = normalizeDomain(patch.domain);
  if (patch.customer_id !== undefined) clean.customer_id = uid(patch.customer_id);
  if (patch.platform !== undefined) clean.platform = patch.platform;
  if (patch.playbook !== undefined) clean.playbook = patch.playbook;
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.notes !== undefined) clean.notes = patch.notes?.trim() || null;
  if (Object.keys(clean).length === 0) return;

  const { error } = await tbl(supabase, "seo_sites")
    .update(clean)
    .eq("id", siteId)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/seo");
  revalidatePath(`/seo/${siteId}`);
}

export async function deleteSeoSite(siteId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "seo_sites")
    .delete()
    .eq("id", siteId)
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/seo");
}
