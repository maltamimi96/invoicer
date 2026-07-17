"use server";

/**
 * Prospects plugin — a cold list that feeds Leads. Manual CRUD + array import
 * (dedup by email) + convert-to-lead. Bulk actions, CSV import UI and outreach
 * land in later PRs. Scopes: prospects:read / prospects:write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { sendToProspects } from "@/lib/prospects/outreach";
import { ilikeAcross } from "@/lib/pg-filter";
import type { Prospect, ProspectStatus } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);
const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

interface ProspectInput {
  name?: string | null; email?: string | null; phone?: string | null; company?: string | null;
  title?: string | null; website?: string | null; source?: string | null;
  status?: ProspectStatus; tags?: string[]; notes?: string | null; custom_fields?: Record<string, unknown>;
}

export async function listProspects(filters?: { status?: ProspectStatus; search?: string; tag?: string; limit?: number }): Promise<Prospect[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "prospects").select("*").eq("business_id", businessId)
    .order("created_at", { ascending: false }).limit(filters?.limit ?? 500);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.tag) q = q.contains("tags", [filters.tag]);
  if (filters?.search?.trim()) {
    q = q.or(ilikeAcross(["name", "email", "company"], filters.search.trim()));
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Prospect[];
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "prospects").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  return (data as Prospect) ?? null;
}

export async function createProspect(input: ProspectInput): Promise<Prospect> {
  const { supabase, user, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "prospects").insert({
    business_id: businessId, user_id: user.id,
    name: clean(input.name), email: clean(input.email)?.toLowerCase() ?? null, phone: clean(input.phone),
    company: clean(input.company), title: clean(input.title), website: clean(input.website), source: clean(input.source) ?? "manual",
    status: input.status ?? "new", tags: input.tags ?? [], notes: clean(input.notes), custom_fields: input.custom_fields ?? {},
  }).select().single();
  if (error) {
    if (String(error.message ?? "").includes("idx_prospects_biz_email")) throw new Error("A prospect with that email already exists.");
    throw error;
  }
  revalidatePath("/prospects");
  return data as Prospect;
}

export async function updateProspect(id: string, patch: ProspectInput & { status?: ProspectStatus }): Promise<void> {
  const { supabase, businessId } = await ctx();
  const c: Record<string, unknown> = {};
  if (patch.name !== undefined) c.name = clean(patch.name);
  if (patch.email !== undefined) c.email = clean(patch.email)?.toLowerCase() ?? null;
  if (patch.phone !== undefined) c.phone = clean(patch.phone);
  if (patch.company !== undefined) c.company = clean(patch.company);
  if (patch.title !== undefined) c.title = clean(patch.title);
  if (patch.website !== undefined) c.website = clean(patch.website);
  if (patch.source !== undefined) c.source = clean(patch.source);
  if (patch.status !== undefined) c.status = patch.status;
  if (patch.tags !== undefined) c.tags = patch.tags;
  if (patch.notes !== undefined) c.notes = clean(patch.notes);
  if (patch.custom_fields !== undefined) c.custom_fields = patch.custom_fields;
  if (Object.keys(c).length === 0) return;
  const { error } = await tbl(supabase, "prospects").update(c).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
}

export async function deleteProspect(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "prospects").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/prospects");
}

/** Import an array of prospects, deduped by email (existing emails skipped). */
export async function importProspects(rows: ProspectInput[]): Promise<{ imported: number; skipped: number }> {
  const { supabase, user, businessId } = await ctx();
  const { data: existing } = await tbl(supabase, "prospects").select("email").eq("business_id", businessId).not("email", "is", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seen = new Set(((existing ?? []) as any[]).map((r) => String(r.email).toLowerCase()));
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of rows) {
    const email = clean(r.email)?.toLowerCase() ?? null;
    if (email && seen.has(email)) { skipped++; continue; }
    if (email) seen.add(email);
    toInsert.push({
      business_id: businessId, user_id: user.id, name: clean(r.name), email, phone: clean(r.phone),
      company: clean(r.company), title: clean(r.title), website: clean(r.website), source: clean(r.source) ?? "import",
      status: r.status ?? "new", tags: r.tags ?? [], notes: clean(r.notes), custom_fields: r.custom_fields ?? {},
    });
  }
  if (toInsert.length) {
    const { error } = await tbl(supabase, "prospects").insert(toInsert);
    if (error) throw error;
  }
  revalidatePath("/prospects");
  return { imported: toInsert.length, skipped };
}

/** Bulk-update prospects (status / source / add-remove a tag). */
export async function bulkUpdateProspects(ids: string[], patch: { status?: ProspectStatus; source?: string | null; add_tag?: string; remove_tag?: string }): Promise<{ updated: number }> {
  const { supabase, businessId } = await ctx();
  if (ids.length === 0) return { updated: 0 };

  if (patch.add_tag || patch.remove_tag) {
    // Tag edits are per-row (array mutation) — fetch, compute, update.
    const { data } = await tbl(supabase, "prospects").select("id, tags").in("id", ids).eq("business_id", businessId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data ?? []) as any[]) {
      let tags: string[] = Array.isArray(p.tags) ? p.tags : [];
      if (patch.add_tag && !tags.includes(patch.add_tag)) tags = [...tags, patch.add_tag];
      if (patch.remove_tag) tags = tags.filter((tg) => tg !== patch.remove_tag);
      await tbl(supabase, "prospects").update({ tags }).eq("id", p.id).eq("business_id", businessId);
    }
  }
  const flat: Record<string, unknown> = {};
  if (patch.status !== undefined) flat.status = patch.status;
  if (patch.source !== undefined) flat.source = clean(patch.source);
  if (Object.keys(flat).length > 0) {
    const { error } = await tbl(supabase, "prospects").update(flat).in("id", ids).eq("business_id", businessId);
    if (error) throw error;
  }
  revalidatePath("/prospects");
  return { updated: ids.length };
}

export async function bulkDeleteProspects(ids: string[]): Promise<{ deleted: number }> {
  const { supabase, businessId } = await ctx();
  if (ids.length === 0) return { deleted: 0 };
  const { error } = await tbl(supabase, "prospects").delete().in("id", ids).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/prospects");
  return { deleted: ids.length };
}

/** Email one or more prospects (merge fields {{name}} {{first_name}} {{company}}). */
export async function emailProspects(prospectIds: string[], subject: string, body: string): Promise<{ sent: number; skipped: number; failed: number }> {
  const { supabase, user, businessId } = await ctx();
  if (!subject.trim() || !body.trim()) throw new Error("Subject and message are required");
  const res = await sendToProspects(supabase, businessId, user.id, prospectIds, subject, body);
  revalidatePath("/prospects");
  for (const id of prospectIds) revalidatePath(`/prospects/${id}`);
  return res;
}

export async function addProspectNote(prospectId: string, note: string): Promise<void> {
  const { supabase, user, businessId } = await ctx();
  if (!note.trim()) return;
  const { error } = await tbl(supabase, "prospect_activities").insert({ business_id: businessId, prospect_id: prospectId, type: "note", summary: note.trim(), created_by: user.id });
  if (error) throw error;
  revalidatePath(`/prospects/${prospectId}`);
}

export async function listProspectActivities(prospectId: string) {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "prospect_activities").select("id, type, summary, created_at")
    .eq("business_id", businessId).eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as Array<{ id: string; type: string; summary: string; created_at: string }>;
}

/** Convert a prospect into a Lead (dedup via upsert_lead) + mark converted. */
export async function convertProspectToLead(id: string): Promise<{ lead_id: string | null }> {
  const { supabase, businessId } = await ctx();
  const { data: p } = await tbl(supabase, "prospects").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!p) throw new Error("Prospect not found");
  const { data: business } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error } = await (supabase as any).rpc("upsert_lead", {
    p_business_id: businessId, p_user_id: business?.user_id, p_name: p.name || p.email || "Prospect",
    p_email: p.email, p_phone: p.phone, p_address: null, p_suburb: null, p_service: null,
    p_property_type: null, p_timing: null,
    p_notes: `Converted from prospect${p.company ? ` (${p.company})` : ""}`, p_source: "prospect", p_source_ref: id,
  }).single();
  if (error) throw error;
  await tbl(supabase, "prospects").update({ status: "converted", lead_id: lead?.id ?? null }).eq("id", id).eq("business_id", businessId);
  revalidatePath("/prospects");
  revalidatePath(`/prospects/${id}`);
  return { lead_id: lead?.id ?? null };
}
