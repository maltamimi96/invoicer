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

/** Point a business at its own VoIPcloud portal (white-label resellers differ). */
export async function setTelephonyEndpoint(url: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  await getTelephonySettings();
  const { assertSafeBaseUrl, VOIP_DEFAULT_BASE } = await import("@/lib/telephony/api");
  const clean = url.trim() ? assertSafeBaseUrl(url) : VOIP_DEFAULT_BASE;
  const { error } = await tbl(supabase, "telephony_settings")
    .update({ api_base_url: clean }).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/calls");
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

// ── REST API: sync + click-to-call ──────────────────────────────────────────

/** Verify the saved API key actually works, and say precisely why if not. */
export async function testTelephonyConnection(): Promise<{ ok: boolean; message: string }> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "telephony_settings").select("api_key_enc, api_base_url")
    .eq("business_id", businessId).maybeSingle();
  if (!data?.api_key_enc) return { ok: false, message: "No API key saved yet." };

  try {
    const { testConnection, VOIP_DEFAULT_BASE } = await import("@/lib/telephony/api");
    const { decryptSecret } = await import("@/lib/crypto");
    await testConnection(data.api_base_url || VOIP_DEFAULT_BASE, decryptSecret(data.api_key_enc));
    return { ok: true, message: "Connected — the API key works." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection failed" };
  }
}

/** Pull call history from the API. Automations stay off during a backfill. */
export async function syncCallsNow(days = 30, includeGroups = true): Promise<{
  fetched: number; ingested: number; skipped: number; errors: string[];
}> {
  const { supabase, businessId } = await ctx();
  const { syncCallsForBusiness, ymd } = await import("@/lib/telephony/sync");
  const res = await syncCallsForBusiness(supabase, businessId, {
    fromDate: ymd(new Date(Date.now() - Math.max(1, days) * 86400_000)),
    includeGroups,
  });
  revalidatePath("/calls");
  return res;
}

/**
 * Click-to-call: rings the configured extension, then dials the customer once
 * it's picked up. The number is passed in E.164 as their API requires.
 */
export async function placeCall(numberToCall: string, userNumber?: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data } = await tbl(supabase, "telephony_settings")
    .select("api_key_enc, api_base_url, default_user_number, default_caller_id, enabled")
    .eq("business_id", businessId).maybeSingle();

  if (!data?.enabled) throw new Error("Phone system isn't connected");
  if (!data.api_key_enc) throw new Error("No API key saved — add one in Calls → Setup");

  const from = userNumber || data.default_user_number;
  if (!from) throw new Error("Set the extension to call from in Calls → Setup");

  const { toE164 } = await import("@/lib/telephony/phone");
  const dest = toE164(numberToCall);
  if (!dest) throw new Error("That doesn't look like a callable number");

  const { callToNumber, VOIP_DEFAULT_BASE } = await import("@/lib/telephony/api");
  const { decryptSecret } = await import("@/lib/crypto");
  await callToNumber(data.api_base_url || VOIP_DEFAULT_BASE, decryptSecret(data.api_key_enc), {
    user_number: from,
    number_to_call: dest,
    caller_id: data.default_caller_id || undefined,
  });
}

// ── Call context: who is this, and what's open for them ─────────────────────

export interface CallContext {
  call: Call;
  party: { kind: "customer" | "contact" | "lead" | "prospect"; id: string; name: string;
           email: string | null; phone: string | null; company: string | null } | null;
  /** Open work for the matched customer — the "active tickets" equivalent. */
  workOrders: { id: string; number: string | null; title: string | null; status: string }[];
  quotes: { id: string; number: string | null; total: number; status: string }[];
  invoices: { id: string; number: string | null; total: number; amount_paid: number; status: string }[];
  recentCalls: { id: string; direction: string; status: string; started_at: string }[];
}

/**
 * Everything worth knowing when the phone rings: who's calling and what's
 * already open for them, so you answer informed rather than asking.
 */
export async function getCallContext(callId: string): Promise<CallContext> {
  const { supabase, businessId } = await ctx();

  const { data: call, error } = await tbl(supabase, "calls")
    .select("*, customers(name,email,phone), leads(name,email,phone), contacts(name,email,phone), prospects(company,email,phone,name)")
    .eq("id", callId).eq("business_id", businessId).single();
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = call as any;
  let party: CallContext["party"] = null;
  if (c.customer_id && c.customers) {
    party = { kind: "customer", id: c.customer_id, name: c.customers.name,
              email: c.customers.email, phone: c.customers.phone, company: null };
  } else if (c.contact_id && c.contacts) {
    party = { kind: "contact", id: c.contact_id, name: c.contacts.name,
              email: c.contacts.email, phone: c.contacts.phone, company: null };
  } else if (c.lead_id && c.leads) {
    party = { kind: "lead", id: c.lead_id, name: c.leads.name,
              email: c.leads.email, phone: c.leads.phone, company: null };
  } else if (c.prospect_id && c.prospects) {
    party = { kind: "prospect", id: c.prospect_id, name: c.prospects.name ?? c.prospects.company ?? "Prospect",
              email: c.prospects.email, phone: c.prospects.phone, company: c.prospects.company };
  }

  const empty = { workOrders: [], quotes: [], invoices: [] };
  // Open work only exists for a customer — a lead has nothing booked yet.
  const related = party?.kind === "customer"
    ? await (async () => {
        const [wo, q, inv] = await Promise.all([
          tbl(supabase, "work_orders").select("id, number, title, status")
            .eq("business_id", businessId).eq("customer_id", party.id)
            .not("status", "in", '("completed","cancelled")')
            .order("created_at", { ascending: false }).limit(5),
          tbl(supabase, "quotes").select("id, number, total, status")
            .eq("business_id", businessId).eq("customer_id", party.id)
            .order("created_at", { ascending: false }).limit(5),
          tbl(supabase, "invoices").select("id, number, total, amount_paid, status")
            .eq("business_id", businessId).eq("customer_id", party.id)
            .neq("status", "paid").order("created_at", { ascending: false }).limit(5),
        ]);
        return { workOrders: wo.data ?? [], quotes: q.data ?? [], invoices: inv.data ?? [] };
      })()
    : empty;

  // Their call history, so you can see "third time this week" at a glance.
  const { data: recent } = c.counterparty_digits
    ? await tbl(supabase, "calls").select("id, direction, status, started_at")
        .eq("business_id", businessId).eq("counterparty_digits", c.counterparty_digits)
        .neq("id", callId).order("started_at", { ascending: false }).limit(5)
    : { data: [] };

  return {
    call: call as Call,
    party,
    ...related,
    recentCalls: recent ?? [],
  } as CallContext;
}

/**
 * Turn an unknown caller into a customer, and back-link every call from that
 * number so the history isn't stranded on the old unmatched rows.
 */
export async function createCustomerFromCall(
  callId: string, name: string, email?: string,
): Promise<{ customer_id: string; linkedCalls: number }> {
  const { supabase, businessId, user } = await ctx();

  const { data: call } = await tbl(supabase, "calls")
    .select("id, from_number, to_number, direction, counterparty_digits")
    .eq("id", callId).eq("business_id", businessId).maybeSingle();
  if (!call) throw new Error("Call not found");
  if (!name.trim()) throw new Error("A name is required");

  const phone = call.direction === "inbound" ? call.from_number : call.to_number;
  const { data: customer, error } = await tbl(supabase, "customers").insert({
    business_id: businessId, user_id: user.id,
    name: name.trim(), phone, email: email?.trim() || null,
  }).select("id").single();
  if (error) throw error;

  // Link every past call from this number, not just the one in front of you.
  let linkedCalls = 0;
  if (call.counterparty_digits) {
    const { data: linked } = await tbl(supabase, "calls")
      .update({ customer_id: customer.id })
      .eq("business_id", businessId).eq("counterparty_digits", call.counterparty_digits)
      .is("customer_id", null).select("id");
    linkedCalls = linked?.length ?? 0;
  }

  revalidatePath("/calls");
  return { customer_id: customer.id, linkedCalls };
}
