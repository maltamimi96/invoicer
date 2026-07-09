"use server";

/**
 * Instant-audit sales engine (docs/SEO_AGENCY_PLAN.md, Phase 4) — agency side.
 * The agency shares a public audit link; prospects who submit become leads +
 * queued audits. Running the audit + emailing the report lands in the follow-up.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function biz(): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  return getActiveBizId(supabase, user.id);
}

/** The public audit link for this business, minting a slug on first use. */
export async function getAuditLink(): Promise<{ slug: string; url: string }> {
  const businessId = await biz();
  const admin = createAdminClient();
  const { data: b } = await tbl(admin, "businesses").select("audit_slug").eq("id", businessId).maybeSingle();
  let slug: string | null = b?.audit_slug ?? null;
  if (!slug) {
    slug = "a" + randomBytes(5).toString("hex");
    const { error } = await tbl(admin, "businesses").update({ audit_slug: slug }).eq("id", businessId);
    if (error) throw error;
  }
  return { slug, url: `${appUrl()}/audit/${slug}` };
}

export async function listAudits() {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_audits")
    .select("id, url, email, name, status, score, lead_id, created_at")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Array<{ id: string; url: string; email: string | null; name: string | null; status: string; score: number | null; lead_id: string | null; created_at: string }>;
}
