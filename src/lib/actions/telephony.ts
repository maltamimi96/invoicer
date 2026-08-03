"use server";

/**
 * Telephony (VoIPcloud) — settings and the call log.
 * Ingest lives in src/lib/telephony/ingest.ts, shared with the webhook route.
 * AI-tool-first: matching MCP tools use scopes telephony:read / telephony:write.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import { appUrl } from "@/lib/app-url";
import { matchNumber } from "@/lib/telephony/ingest";
import type { TelephonySettings, Call } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

/** Lazily creates the row so the UI always has something to bind to. */
export async function getTelephonySettings(): Promise<TelephonySettings> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "telephony_settings").select("*")
    .eq("business_id", businessId).maybeSingle();
  if (data) return data as TelephonySettings;
  const { data: created, error } = await tbl(supabase, "telephony_settings")
    .insert({ business_id: businessId }).select().single();
  if (error) throw error;
  return created as TelephonySettings;
}

/** The URL to paste into VoIPcloud's webhook configuration. */
export async function getWebhookUrl(): Promise<string> {
  const s = await getTelephonySettings();
  return `${appUrl()}/api/webhooks/voipcloud/${s.webhook_token}`;
}

export async function updateTelephonySettings(patch: Partial<Omit<TelephonySettings,
  "business_id" | "created_at" | "updated_at" | "webhook_token" | "api_key_enc">>): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getTelephonySettings();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const { error } = await tbl(supabase, "telephony_settings").update(clean).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/calls");
}

/** Rotate the webhook token — invalidates the old URL immediately. */
export async function rotateWebhookToken(): Promise<string> {
  const { supabase, businessId } = await ctx();
  await getTelephonySettings();
  const token = randomBytes(16).toString("hex");
  const { error } = await tbl(supabase, "telephony_settings")
    .update({ webhook_token: token }).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/calls");
  return `${appUrl()}/api/webhooks/voipcloud/${token}`;
}

/** Store the PBX API key encrypted (used later for click-to-call). */
export async function setTelephonyApiKey(key: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  if (!encryptionAvailable()) throw new Error("APP_ENCRYPTION_KEY is not configured on the server");
  await getTelephonySettings();
  const { error } = await tbl(supabase, "telephony_settings")
    .update({ api_key_enc: key.trim() ? encryptSecret(key.trim()) : null })
    .eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/calls");
}

export async function listCalls(filters?: {
  customer_id?: string; status?: string; limit?: number;
}): Promise<Call[]> {
  const { supabase, businessId } = await ctx();
  let q = tbl(supabase, "calls")
    .select("*, customers(name), leads(name), contacts(name), prospects(company)")
    .eq("business_id", businessId)
    .order("started_at", { ascending: false })
    .limit(filters?.limit ?? 200);
  if (filters?.customer_id) q = q.eq("customer_id", filters.customer_id);
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Call[];
}

export interface CallStats {
  total: number; inbound: number; outbound: number; missed: number; voicemail: number; unmatched: number;
}

export async function getCallStats(): Promise<CallStats> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "calls")
    .select("direction, status, customer_id, lead_id, contact_id, prospect_id")
    .eq("business_id", businessId).limit(5000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return {
    total: rows.length,
    inbound: rows.filter((r) => r.direction === "inbound").length,
    outbound: rows.filter((r) => r.direction === "outbound").length,
    missed: rows.filter((r) => r.status === "missed").length,
    voicemail: rows.filter((r) => r.status === "voicemail").length,
    unmatched: rows.filter((r) => !r.customer_id && !r.lead_id && !r.contact_id && !r.prospect_id).length,
  };
}

/** Free-text note against a call (what was discussed). */
export async function setCallNotes(callId: string, notes: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { error } = await tbl(supabase, "calls").update({ notes })
    .eq("id", callId).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/calls");
}

/**
 * Re-run caller-ID matching on calls that arrived before the customer existed
 * — e.g. an unknown number that later got added as a customer.
 */
export async function rematchCalls(limit = 200): Promise<number> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "calls")
    .select("id, counterparty_digits")
    .eq("business_id", businessId)
    .is("customer_id", null).is("lead_id", null).is("contact_id", null).is("prospect_id", null)
    .not("counterparty_digits", "is", null)
    .limit(limit);

  let matched = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const call of ((data ?? []) as any[])) {
    const m = await matchNumber(supabase, businessId, call.counterparty_digits);
    if (!m.customer_id && !m.lead_id && !m.contact_id && !m.prospect_id) continue;
    await tbl(supabase, "calls").update({
      customer_id: m.customer_id ?? null, contact_id: m.contact_id ?? null,
      lead_id: m.lead_id ?? null, prospect_id: m.prospect_id ?? null,
    }).eq("id", call.id);
    matched++;
  }
  revalidatePath("/calls");
  return matched;
}
