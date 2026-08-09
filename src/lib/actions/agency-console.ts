"use server";

/**
 * The agency console: every client account at once.
 *
 * Every other page in Kirei is scoped to one business through the
 * active_business_id cookie. This is the deliberate exception — an agency
 * running several trade businesses needs to see across them without switching
 * six times to find out who is overdue.
 *
 * ⚠️ The safety of that rests on a specific fact, so it is worth stating: the
 * RLS predicates on these tables are MEMBERSHIP-based, not cookie-based —
 *
 *     business_id IN (
 *       SELECT id FROM businesses WHERE user_id = auth.uid()
 *       UNION SELECT business_id FROM business_members
 *             WHERE user_id = auth.uid() AND status = 'active')
 *
 * The cookie only ever NARROWS what you see; the database is what stops you
 * seeing someone else's. So omitting the business_id filter here returns rows
 * for exactly the businesses this user may reach, and no others. This runs on
 * the ordinary user client — never the admin client, which would bypass the
 * very check being relied on.
 */
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export interface ClientAccount {
  id: string;
  name: string;
  industryPreset: string | null;
  /** Owned by this user, versus a business they're a member of. */
  owned: boolean;
  currency: string;
  outstanding: number;
  overdue: number;
  overdueCount: number;
  jobsToday: number;
  /** Most recent invoice date seen, for a "nothing has happened here" hint. */
  lastInvoiceAt: string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function getClientAccounts(): Promise<ClientAccount[]> {
  const supabase = await createClient();
  const user = await getUser();

  // Businesses this user owns or belongs to. Two queries rather than an `or()`
  // across a join — PostgREST's or-grammar has bitten this codebase before.
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    tbl(supabase, "businesses").select("id, name, currency, industry_preset").eq("user_id", user.id),
    tbl(supabase, "business_members").select("business_id").eq("user_id", user.id).eq("status", "active"),
  ]);

  const ownedIds = new Set<string>((owned ?? []).map((b: { id: string }) => b.id));
  const memberIds = ((memberships ?? []) as Array<{ business_id: string }>)
    .map((m) => m.business_id)
    .filter((id) => !ownedIds.has(id));

  let memberBusinesses: Array<{ id: string; name: string; currency: string; industry_preset: string | null }> = [];
  if (memberIds.length) {
    const { data } = await tbl(supabase, "businesses")
      .select("id, name, currency, industry_preset").in("id", memberIds);
    memberBusinesses = data ?? [];
  }

  const businesses = [...(owned ?? []), ...memberBusinesses];
  if (businesses.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);

  // No .eq("business_id", …) on purpose — see the note at the top. One query
  // for every account rather than one per account.
  const [{ data: invoices }, { data: jobs }] = await Promise.all([
    tbl(supabase, "invoices")
      .select("business_id, status, total, amount_paid, due_date, issue_date")
      .neq("status", "draft")
      .limit(5000),
    tbl(supabase, "work_orders")
      .select("business_id, scheduled_date")
      .eq("scheduled_date", today)
      .limit(2000),
  ]);

  const byBiz = new Map<string, ClientAccount>();
  for (const b of businesses) {
    byBiz.set(b.id, {
      id: b.id,
      name: b.name,
      industryPreset: b.industry_preset ?? null,
      owned: ownedIds.has(b.id),
      currency: b.currency ?? "GBP",
      outstanding: 0, overdue: 0, overdueCount: 0, jobsToday: 0, lastInvoiceAt: null,
    });
  }

  for (const inv of (invoices ?? []) as Array<Record<string, unknown>>) {
    const acc = byBiz.get(String(inv.business_id));
    if (!acc) continue;                       // a business RLS allowed but we didn't list
    // PostgREST returns numerics as strings; plain arithmetic gives NaN.
    const due = num(inv.total) - num(inv.amount_paid);
    const status = String(inv.status ?? "");
    if (status !== "paid" && due > 0) {
      acc.outstanding += due;
      const overdue = status === "overdue"
        || (typeof inv.due_date === "string" && inv.due_date < today);
      if (overdue) { acc.overdue += due; acc.overdueCount += 1; }
    }
    const issued = typeof inv.issue_date === "string" ? inv.issue_date : null;
    if (issued && (!acc.lastInvoiceAt || issued > acc.lastInvoiceAt)) acc.lastInvoiceAt = issued;
  }

  for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
    const acc = byBiz.get(String(job.business_id));
    if (acc) acc.jobsToday += 1;
  }

  // Whoever needs attention first: most overdue money, then most outstanding.
  return [...byBiz.values()].sort((a, b) =>
    b.overdue - a.overdue || b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}
