"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Report, ReportWithCustomer, ReportSection, ReportPhoto, Customer } from "@/types/database";
import { getDefaultSections } from "@/lib/templates/roof-inspection";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getReports(filters?: { customer_id?: string }): Promise<ReportWithCustomer[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "reports")
    .select("*, customers(id, name, email, company)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw error;
  return data as ReportWithCustomer[];
}

export async function getReport(id: string): Promise<Report & { customers: Customer | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "reports")
    .select("*, customers(*)")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();

  if (error) throw error;
  return data as Report & { customers: Customer | null };
}

export async function createReport(payload: {
  title: string;
  customer_id?: string | null;
  property_address?: string;
  inspection_date?: string;
  report_date?: string;
  meta?: Partial<Report["meta"]>;
}): Promise<Report> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const defaultMeta: Report["meta"] = {
    advisory_banner: "",
    roof_type: "",
    inspector_name: "",
    roof_features: "",
    inspection_method: "Direct on-roof visual inspection; close-contact photographic documentation",
    risk_items: [],
    scope_of_works: [],
    urgency: "",
    ...payload.meta,
  };

  const { data, error } = await tbl(supabase, "reports").insert({
    user_id: user.id,
    business_id: businessId,
    title: payload.title,
    status: "draft",
    customer_id: payload.customer_id ?? null,
    property_address: payload.property_address ?? null,
    inspection_date: payload.inspection_date ?? null,
    report_date: payload.report_date ?? new Date().toISOString().split("T")[0],
    sections: getDefaultSections(),
    photos: [],
    meta: defaultMeta,
  }).select().single();

  if (error) throw error;
  return data as Report;
}

export async function updateReport(id: string, payload: Partial<Omit<Report, "id" | "user_id" | "created_at" | "updated_at">>): Promise<Report> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "reports")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) throw error;
  revalidatePath(`/reports/${id}`);
  return data as Report;
}

export async function updateReportSection(reportId: string, sectionId: string, content: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: existing, error: fetchError } = await tbl(supabase, "reports")
    .select("sections")
    .eq("id", reportId)
    .eq("business_id", businessId)
    .single();

  if (fetchError) throw fetchError;

  const sections: ReportSection[] = existing.sections ?? [];
  const updated = sections.map((s: ReportSection) =>
    s.id === sectionId ? { ...s, content } : s
  );

  const { error } = await tbl(supabase, "reports")
    .update({ sections: updated, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath(`/reports/${reportId}`);
}

export async function updateReportPhotos(reportId: string, photos: ReportPhoto[]): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "reports")
    .update({ photos, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath(`/reports/${reportId}`);
}

export async function updateReportMeta(reportId: string, meta: Partial<Report["meta"]>): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: existing, error: fetchError } = await tbl(supabase, "reports")
    .select("meta")
    .eq("id", reportId)
    .eq("business_id", businessId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await tbl(supabase, "reports")
    .update({ meta: { ...existing.meta, ...meta }, updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath(`/reports/${reportId}`);
}

export async function updateReportStatus(id: string, status: Report["status"]): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
}

export async function deleteReport(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // Delete storage objects first
  try {
    const { data: files } = await supabase.storage
      .from("report-images")
      .list(`${user.id}/${id}`);

    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${id}/${f.name}`);
      await supabase.storage.from("report-images").remove(paths);
    }
  } catch {
    // Storage cleanup failure should not block DB delete
  }

  const { error } = await tbl(supabase, "reports")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) throw error;
  revalidatePath("/reports");
}
