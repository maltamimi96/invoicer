"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export interface QuotingAgentSettings {
  business_id:              string;
  enabled:                  boolean;
  onboarded_at:             string | null;
  industries:               string[];
  default_hourly_rate:      number | null;
  default_margin_percent:   number | null;
  default_tax_rate:         number | null;
  call_out_fee:             number | null;
  emergency_rate_multiplier: number | null;
  estimation_mode:          "manual" | "ai_estimate" | "skip";
  business_notes:           string | null;
}

export type KnowledgeKind = "material" | "labour" | "margin" | "scope_template" | "rate" | "note";

export interface KnowledgeRow {
  id:           string;
  business_id:  string;
  kind:         KnowledgeKind;
  key:          string;
  value:        string;
  unit:         string | null;
  category:     string | null;
  source:       "user" | "ai_estimate" | "imported";
  notes:        string | null;
  confirmed:    boolean;
  created_at:   string;
  updated_at:   string;
}

/** Fetch the quoting-agent settings for the active business — creates a
 *  disabled row on first call so the UI always has somewhere to write. */
export async function getQuotingAgentSettings(): Promise<QuotingAgentSettings> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data } = await tbl(supabase, "quoting_agent_settings")
    .select("*").eq("business_id", businessId).maybeSingle();

  if (data) return data as QuotingAgentSettings;

  // Lazily create a default row
  const { data: created, error } = await tbl(supabase, "quoting_agent_settings")
    .insert({ business_id: businessId, enabled: false })
    .select("*").single();
  if (error) throw error;
  return created as QuotingAgentSettings;
}

export async function setQuotingAgentEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  await tbl(supabase, "quoting_agent_settings")
    .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  revalidatePath("/quoting-agent");
  revalidatePath("/", "layout"); // sidebar visibility
}

export async function updateQuotingAgentSettings(patch: Partial<Omit<QuotingAgentSettings, "business_id" | "onboarded_at">>): Promise<QuotingAgentSettings> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "quoting_agent_settings")
    .upsert({ business_id: businessId, ...patch }, { onConflict: "business_id" })
    .select("*").single();
  if (error) throw error;
  revalidatePath("/quoting-agent");
  revalidatePath("/quoting-agent/settings");
  return data as QuotingAgentSettings;
}

/** Mark onboarding complete + persist final settings. */
export async function completeQuotingAgentOnboarding(input: {
  industries:               string[];
  default_hourly_rate:      number | null;
  default_margin_percent:   number | null;
  default_tax_rate:         number | null;
  call_out_fee:             number | null;
  emergency_rate_multiplier: number | null;
  estimation_mode:          "manual" | "ai_estimate" | "skip";
  business_notes:           string | null;
}): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  await tbl(supabase, "quoting_agent_settings").upsert({
    business_id: businessId,
    enabled: true,
    onboarded_at: new Date().toISOString(),
    ...input,
  }, { onConflict: "business_id" });
  revalidatePath("/quoting-agent");
  revalidatePath("/", "layout");
}

// ── Knowledge bank CRUD ─────────────────────────────────────────────────────

export async function listKnowledge(filters?: { kind?: KnowledgeKind; category?: string; search?: string }): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  let q = tbl(supabase, "quoting_agent_knowledge")
    .select("*")
    .eq("business_id", businessId)
    .order("kind", { ascending: true })
    .order("key",  { ascending: true });
  if (filters?.kind)     q = q.eq("kind", filters.kind);
  if (filters?.category) q = q.eq("category", filters.category);
  if (filters?.search)   q = q.ilike("key", `%${filters.search}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

export async function addKnowledge(input: {
  kind:      KnowledgeKind;
  key:       string;
  value:     string;
  unit?:     string | null;
  category?: string | null;
  source?:   "user" | "ai_estimate" | "imported";
  notes?:    string | null;
  confirmed?: boolean;
}): Promise<KnowledgeRow> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "quoting_agent_knowledge")
    .upsert({
      business_id: businessId,
      kind: input.kind,
      key:  input.key.trim().toLowerCase(),
      value: input.value,
      unit: input.unit ?? null,
      category: input.category ?? null,
      source: input.source ?? "user",
      notes: input.notes ?? null,
      confirmed: input.confirmed ?? (input.source !== "ai_estimate"),
    }, { onConflict: "business_id,kind,key" })
    .select("*").single();
  if (error) throw error;
  revalidatePath("/quoting-agent");
  revalidatePath("/quoting-agent/settings");
  return data as KnowledgeRow;
}

export async function updateKnowledge(id: string, patch: Partial<Omit<KnowledgeRow, "id" | "business_id" | "created_at" | "updated_at">>): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const update: Record<string, unknown> = { ...patch };
  if (typeof patch.key === "string") update.key = patch.key.trim().toLowerCase();

  const { error } = await tbl(supabase, "quoting_agent_knowledge")
    .update(update).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/quoting-agent");
  revalidatePath("/quoting-agent/settings");
}

export async function deleteKnowledge(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "quoting_agent_knowledge")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/quoting-agent");
  revalidatePath("/quoting-agent/settings");
}

/** Bulk-seed knowledge — used during onboarding when the user accepts a
 *  set of AI-estimated values, or when they hand-enter their pricing list. */
export async function bulkAddKnowledge(rows: Array<Parameters<typeof addKnowledge>[0]>): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const payload = rows.map((r) => ({
    business_id: businessId,
    kind: r.kind,
    key:  r.key.trim().toLowerCase(),
    value: r.value,
    unit: r.unit ?? null,
    category: r.category ?? null,
    source: r.source ?? "user",
    notes: r.notes ?? null,
    confirmed: r.confirmed ?? (r.source !== "ai_estimate"),
  }));
  if (payload.length === 0) return;

  const { error } = await tbl(supabase, "quoting_agent_knowledge")
    .upsert(payload, { onConflict: "business_id,kind,key" });
  if (error) throw error;
  revalidatePath("/quoting-agent");
  revalidatePath("/quoting-agent/settings");
}
