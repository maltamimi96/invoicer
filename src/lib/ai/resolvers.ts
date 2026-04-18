"use server";

/**
 * Natural-language resolvers for the AI assistant + voice prompts.
 *
 * Every entity the AI can reference (customer, site, worker, contact, billing
 * profile, product) has a resolver here that takes a free-text query and
 * returns the best match (plus runner-ups for disambiguation).
 *
 * Date/time parser turns "tomorrow at 2pm" → { date, time }.
 *
 * All resolvers are tenant-scoped via getActiveBizId — safe to call from any
 * authenticated server context.
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export interface ResolveResult<T> {
  match: T | null;
  candidates: T[];
  ambiguous: boolean;
}

function pickBest<T extends { name?: string | null }>(query: string, rows: T[]): ResolveResult<T> {
  if (rows.length === 0) return { match: null, candidates: [], ambiguous: false };
  if (rows.length === 1) return { match: rows[0], candidates: rows, ambiguous: false };
  const q = query.toLowerCase().trim();
  const exact = rows.find((r) => (r.name ?? "").toLowerCase() === q);
  if (exact) return { match: exact, candidates: rows, ambiguous: false };
  return { match: rows[0], candidates: rows, ambiguous: true };
}

// ── Customers / Accounts ─────────────────────────────────────────────────────

export interface CustomerHit {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export async function resolveCustomer(query: string): Promise<ResolveResult<CustomerHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  if (!q) return { match: null, candidates: [], ambiguous: false };
  const { data } = await tbl(supabase, "customers")
    .select("id, name, company, email, phone")
    .eq("business_id", businessId)
    .eq("archived", false)
    .or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  return pickBest(q, (data ?? []) as CustomerHit[]);
}

// ── Sites ────────────────────────────────────────────────────────────────────

export interface SiteHit {
  id: string;
  account_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

export async function resolveSite(query: string, accountId?: string): Promise<ResolveResult<SiteHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  if (!q) return { match: null, candidates: [], ambiguous: false };
  let req = tbl(supabase, "sites")
    .select("id, account_id, label, address, city, postcode")
    .eq("business_id", businessId)
    .eq("archived", false)
    .or(`label.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,postcode.ilike.%${q}%`)
    .limit(8);
  if (accountId) req = req.eq("account_id", accountId);
  const { data } = await req;
  const rows = (data ?? []) as SiteHit[];
  // pickBest expects .name — adapt
  const adapted = rows.map((r) => ({ ...r, name: r.label ?? r.address ?? "" }));
  const result = pickBest(q, adapted);
  return {
    match: result.match ? (result.match as SiteHit) : null,
    candidates: result.candidates as SiteHit[],
    ambiguous: result.ambiguous,
  };
}

// ── Workers (member_profiles) ────────────────────────────────────────────────

export interface WorkerHit {
  id: string;
  name: string;
  email: string | null;
  role_title: string | null;
}

export async function resolveWorker(query: string): Promise<ResolveResult<WorkerHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  if (!q) return { match: null, candidates: [], ambiguous: false };
  const { data } = await tbl(supabase, "member_profiles")
    .select("id, name, email, role_title")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  return pickBest(q, (data ?? []) as WorkerHit[]);
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export interface ContactHit {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
}

export async function resolveContact(query: string, accountId?: string): Promise<ResolveResult<ContactHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  if (!q) return { match: null, candidates: [], ambiguous: false };
  let req = tbl(supabase, "contacts")
    .select("id, account_id, name, email, phone, role")
    .eq("business_id", businessId)
    .eq("archived", false)
    .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(8);
  if (accountId) req = req.eq("account_id", accountId);
  const { data } = await req;
  return pickBest(q, (data ?? []) as ContactHit[]);
}

// ── Billing profiles ─────────────────────────────────────────────────────────

export interface BillingProfileHit {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  is_default: boolean;
}

export async function resolveBillingProfile(query: string, accountId?: string): Promise<ResolveResult<BillingProfileHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  let req = tbl(supabase, "billing_profiles")
    .select("id, account_id, name, email, is_default")
    .eq("business_id", businessId)
    .eq("archived", false)
    .limit(8);
  if (accountId) req = req.eq("account_id", accountId);
  if (q) req = req.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await req;
  return pickBest(q, (data ?? []) as BillingProfileHit[]);
}

// ── Products ─────────────────────────────────────────────────────────────────

export interface ProductHit {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  tax_rate: number;
  unit: string | null;
}

export async function resolveProduct(query: string): Promise<ResolveResult<ProductHit>> {
  const { supabase, businessId } = await ctx();
  const q = query.trim();
  if (!q) return { match: null, candidates: [], ambiguous: false };
  const { data } = await tbl(supabase, "products")
    .select("id, name, description, unit_price, tax_rate, unit")
    .eq("business_id", businessId)
    .eq("archived", false)
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(8);
  return pickBest(q, (data ?? []) as ProductHit[]);
}

// ── Date/time parser ─────────────────────────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/**
 * Parse natural-language date/time phrases into structured fields.
 *
 * Examples:
 *   "tomorrow at 2pm"        → { date: "2026-04-19", time: "14:00" }
 *   "next monday 9am"        → { date: "2026-04-20", time: "09:00" }
 *   "today"                  → { date: "2026-04-18" }
 *   "in 3 days"              → { date: "2026-04-21" }
 *   "2pm"                    → { time: "14:00" }
 *   "2026-05-01 14:30"       → { date: "2026-05-01", time: "14:30" }
 */
export async function parseWhen(text: string, now: Date = new Date()): Promise<{ date?: string; time?: string; raw: string }> {
  const t = text.toLowerCase().trim();
  const out: { date?: string; time?: string; raw: string } = { raw: text };

  // ISO date
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) out.date = iso[1];

  // Time: 2pm, 2:30pm, 14:00, 9am
  const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    if (tm[3]) {
      let h = parseInt(tm[1], 10);
      const m = tm[2] ? parseInt(tm[2], 10) : 0;
      if (tm[3] === "pm" && h < 12) h += 12;
      if (tm[3] === "am" && h === 12) h = 0;
      out.time = `${pad(h)}:${pad(m)}`;
    } else if (tm[4]) {
      out.time = `${pad(parseInt(tm[4], 10))}:${pad(parseInt(tm[5], 10))}`;
    }
  }

  if (out.date) return out;

  // Relative dates
  if (/\btoday\b/.test(t))    { out.date = toDateStr(now); return out; }
  if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); out.date = toDateStr(d); return out; }
  if (/\byesterday\b/.test(t)){ const d = new Date(now); d.setDate(d.getDate() - 1); out.date = toDateStr(d); return out; }

  const inN = t.match(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/);
  if (inN) {
    const n = parseInt(inN[1], 10);
    const days = inN[2].startsWith("week") ? n * 7 : n;
    const d = new Date(now); d.setDate(d.getDate() + days);
    out.date = toDateStr(d);
    return out;
  }

  // "next monday", "this friday", "monday"
  const dayMatch = t.match(/\b(?:(next|this)\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/);
  if (dayMatch) {
    const target = DAY_NAMES[dayMatch[2]];
    const d = new Date(now);
    const cur = d.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 || dayMatch[1] === "next") delta = delta === 0 ? 7 : delta;
    if (dayMatch[1] === "next" && delta < 7) delta += 7;
    d.setDate(d.getDate() + delta);
    out.date = toDateStr(d);
    return out;
  }

  return out;
}
