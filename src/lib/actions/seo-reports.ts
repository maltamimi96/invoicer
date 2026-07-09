"use server";

/**
 * White-label SEO reports (docs/SEO_AGENCY_PLAN.md, Phase 3). Assembles a
 * period report from existing SEO data — rankings movement (from keyword
 * snapshots), work delivered (content shipped + opportunities done), and a
 * next-month plan (top queued opportunities). Rendered to a branded PDF by
 * /api/pdf/seo-report. Dependency-free: no ranking data yet just means the
 * rankings section is empty with a "connect Search Console" note.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { assembleReport } from "@/lib/seo/report";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function biz(): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  return getActiveBizId(supabase, user.id);
}

export async function generateSeoReport(siteId: string, periodDays = 30): Promise<{ report_id: string }> {
  const businessId = await biz();
  const supabase = await createClient();

  const { data: site } = await tbl(supabase, "seo_sites").select("id, domain").eq("id", siteId).eq("business_id", businessId).maybeSingle();
  if (!site) throw new Error("Site not found");

  const fields = await assembleReport(supabase, businessId, siteId, site.domain, periodDays);
  const { data: report, error } = await tbl(supabase, "seo_reports").insert({
    business_id: businessId, site_id: siteId, status: "draft", ...fields,
  }).select("id").single();
  if (error) throw error;

  revalidatePath(`/seo/${siteId}`);
  return { report_id: report.id };
}

export async function listSeoReports(siteId: string) {
  const businessId = await biz();
  const supabase = await createClient();
  const { data } = await tbl(supabase, "seo_reports")
    .select("id, title, period_start, period_end, status, created_at, sent_at")
    .eq("business_id", businessId).eq("site_id", siteId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Array<{ id: string; title: string | null; period_start: string; period_end: string; status: string; created_at: string; sent_at: string | null }>;
}

export async function approveSeoReport(id: string, siteId: string): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const { error } = await tbl(supabase, "seo_reports").update({ status: "approved" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/seo/${siteId}`);
}

export async function deleteSeoReport(id: string, siteId: string): Promise<void> {
  const businessId = await biz();
  const supabase = await createClient();
  const { error } = await tbl(supabase, "seo_reports").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/seo/${siteId}`);
}
