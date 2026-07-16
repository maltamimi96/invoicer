import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupaClient, SupabaseClient } from "@supabase/supabase-js";
import { ilikeAcross } from "@/lib/pg-filter";
import { AI_MODELS } from "@/lib/ai/models";

/**
 * Mobile-flavoured agent endpoint.
 *
 * Authenticates via Authorization: Bearer <access_token>, then talks to
 * Postgres through a Supabase client that forwards that token — RLS scopes
 * everything to the caller. Tool set is intentionally small and read-mostly
 * so we don't need to plumb cookie-bound server actions through here.
 *
 * Mirrors the spirit of /api/agent without the 30+ tool surface — this one
 * answers "what's overdue", "who hasn't paid", "find quote QT-0042", and
 * applies a few low-risk write actions (mark invoice paid / quote sent /
 * lead status).
 */

const anthropic = new Anthropic();

/** Multi-turn tool loop — without this the platform default applies and the
 *  function is killed mid-chain. */
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface ToolContext {
  supa:        SupabaseClient;
  businessId:  string;
  userId:      string;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_customers",
    description: "Find customers by name, email, or company. Always call before giving the user a customer answer.",
    input_schema: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "search_invoices",
    description: "Search invoices by number, customer name, or filter by status (draft|sent|partial|paid|overdue). Returns balance + due date.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "search_quotes",
    description: "Search quotes by number / customer name, optionally filter by status (draft|sent|accepted|rejected|expired).",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "search_leads",
    description: "Search leads by name, optionally filter by status (new|contacted|quoted|won|lost).",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "get_briefing",
    description: "Today's punch list — overdue invoices, stale quotes, new leads, unassigned jobs, submitted work orders awaiting review.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_today",
    description: "What's on today — scheduled jobs, who they're assigned to.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "mark_invoice_paid",
    description: "Mark an invoice as fully paid. Use after the user confirms.",
    input_schema: { type: "object" as const, properties: { invoice_id: { type: "string" } }, required: ["invoice_id"] },
  },
  {
    name: "mark_quote_status",
    description: "Update a quote's status. Use after user confirms.",
    input_schema: {
      type: "object" as const,
      properties: { quote_id: { type: "string" }, status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] } },
      required: ["quote_id", "status"],
    },
  },
  {
    name: "set_lead_status",
    description: "Update a lead's status (new, contacted, quoted, won, lost).",
    input_schema: {
      type: "object" as const,
      properties: { lead_id: { type: "string" }, status: { type: "string", enum: ["new", "contacted", "quoted", "won", "lost"] } },
      required: ["lead_id", "status"],
    },
  },
];

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return Number.isFinite(n) ? n : 0; };
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const { supa, businessId } = ctx;

  if (name === "search_customers") {
    const q = String(input.query ?? "").trim();
    let query = supa.from("customers")
      .select("id, name, company, email, phone, archived")
      .eq("business_id", businessId)
      .eq("archived", false)
      .limit(20);
    if (q) query = query.or(ilikeAcross(["name", "company", "email"], q));
    const { data } = await query;
    return data ?? [];
  }

  if (name === "search_invoices") {
    const q = String(input.query ?? "").trim();
    const status = input.status as string | undefined;
    let query = supa.from("invoices")
      .select("id, number, status, total, amount_paid, due_date, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (status) query = query.eq("status", status);
    if (q) query = query.or(ilikeAcross(["number"], q));
    const { data } = await query;
    return (data ?? []).map((inv: { id: string; number: string; status: string; total: unknown; amount_paid: unknown; due_date: string | null; customers: unknown }) => {
      const cust = inv.customers as { name: string } | { name: string }[] | null;
      const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      return {
        id: inv.id, number: inv.number, status: inv.status,
        total: num(inv.total), balance: Math.max(0, num(inv.total) - num(inv.amount_paid)),
        due_date: inv.due_date, customer: custName ?? null,
      };
    });
  }

  if (name === "search_quotes") {
    const q = String(input.query ?? "").trim();
    const status = input.status as string | undefined;
    let query = supa.from("quotes")
      .select("id, number, status, total, expiry_date, customers(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (status) query = query.eq("status", status);
    if (q) query = query.or(ilikeAcross(["number"], q));
    const { data } = await query;
    return (data ?? []).map((q: { id: string; number: string; status: string; total: unknown; expiry_date: string | null; customers: unknown }) => {
      const cust = q.customers as { name: string } | { name: string }[] | null;
      const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      return { id: q.id, number: q.number, status: q.status, total: num(q.total), expiry_date: q.expiry_date, customer: custName ?? null };
    });
  }

  if (name === "search_leads") {
    const q = String(input.query ?? "").trim();
    const status = input.status as string | undefined;
    let query = supa.from("leads")
      .select("id, name, status, source, suburb, email, phone, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (status) query = query.eq("status", status);
    if (q) query = query.or(ilikeAcross(["name"], q));
    const { data } = await query;
    return data ?? [];
  }

  if (name === "get_briefing") {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [
      { data: invoices }, { data: quotes }, { data: leads },
      { data: jobsToday }, { data: submitted },
    ] = await Promise.all([
      supa.from("invoices").select("id, number, status, total, amount_paid, due_date, customers(name)").eq("business_id", businessId).in("status", ["sent", "partial", "overdue"]),
      supa.from("quotes").select("id, number, updated_at, customers(name)").eq("business_id", businessId).eq("status", "sent").lt("updated_at", sevenDaysAgo),
      supa.from("leads").select("id, name, created_at").eq("business_id", businessId).eq("status", "new"),
      supa.from("work_orders").select("id, number, title, customers(name), work_order_assignments(member_profile_id)").eq("business_id", businessId).eq("scheduled_date", today),
      supa.from("work_orders").select("id, number, title, customers(name), updated_at").eq("business_id", businessId).eq("status", "submitted"),
    ]);

    const out: Array<{ kind: string; title: string; subtitle: string; priority: string }> = [];
    for (const inv of (invoices ?? []) as Array<{ id: string; number: string; total: unknown; amount_paid: unknown; due_date: string | null; customers: unknown }>) {
      if (!inv.due_date || new Date(inv.due_date) >= new Date()) continue;
      const balance = Math.max(0, num(inv.total) - num(inv.amount_paid));
      if (balance < 0.01) continue;
      const days = daysAgo(inv.due_date);
      const cust = inv.customers as { name: string } | { name: string }[] | null;
      const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      out.push({ kind: "overdue_invoice", title: `${inv.number} · ${days}d overdue`, subtitle: `${custName ?? "—"} · $${balance.toFixed(2)}`, priority: days > 30 ? "high" : days > 14 ? "med" : "low" });
    }
    for (const q of (quotes ?? []) as Array<{ id: string; number: string; updated_at: string; customers: unknown }>) {
      const days = daysAgo(q.updated_at);
      const cust = q.customers as { name: string } | { name: string }[] | null;
      const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      out.push({ kind: "stale_quote", title: `${q.number} · sent ${days}d ago`, subtitle: custName ?? "No customer", priority: days > 14 ? "med" : "low" });
    }
    for (const l of (leads ?? []) as Array<{ id: string; name: string; created_at: string }>) {
      const days = daysAgo(l.created_at);
      out.push({ kind: "new_lead", title: l.name, subtitle: days === 0 ? "New today" : `${days}d ago`, priority: days > 2 ? "high" : "med" });
    }
    for (const j of (jobsToday ?? []) as Array<{ id: string; number: string; title: string; customers: unknown; work_order_assignments: Array<unknown> }>) {
      if (!j.work_order_assignments || j.work_order_assignments.length === 0) {
        const cust = j.customers as { name: string } | { name: string }[] | null;
        const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
        out.push({ kind: "today_job_unassigned", title: `${j.number} today`, subtitle: `${j.title}${custName ? ` · ${custName}` : ""}`, priority: "high" });
      }
    }
    for (const w of (submitted ?? []) as Array<{ id: string; number: string; title: string; customers: unknown; updated_at: string }>) {
      const days = daysAgo(w.updated_at);
      const cust = w.customers as { name: string } | { name: string }[] | null;
      const custName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      out.push({ kind: "submitted_workorder", title: `${w.number} submitted`, subtitle: `${w.title}${custName ? ` · ${custName}` : ""}`, priority: days > 1 ? "high" : "med" });
    }
    return out;
  }

  if (name === "get_today") {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supa.from("work_orders")
      .select("id, number, title, status, scheduled_date, customers(name), work_order_assignments(member_profiles(name))")
      .eq("business_id", businessId).eq("scheduled_date", today);
    return (data ?? []).map((w: { id: string; number: string; title: string; status: string; customers: unknown; work_order_assignments: Array<{ member_profiles: unknown }> }) => {
      const cust = w.customers as { name: string } | { name: string }[] | null;
      const workers = (w.work_order_assignments ?? []).map((a) => {
        const m = a.member_profiles as { name: string } | { name: string }[] | null;
        return Array.isArray(m) ? m[0]?.name : m?.name;
      }).filter(Boolean);
      return {
        number: w.number, title: w.title, status: w.status,
        customer: Array.isArray(cust) ? cust[0]?.name : cust?.name,
        workers,
      };
    });
  }

  if (name === "mark_invoice_paid") {
    const id = String(input.invoice_id);
    const { data: inv } = await supa.from("invoices").select("total").eq("id", id).eq("business_id", businessId).single();
    const total = num((inv as { total: unknown } | null)?.total);
    const { error } = await supa.from("invoices").update({ amount_paid: total, status: "paid" }).eq("id", id);
    return error ? { error: error.message } : { ok: true, total };
  }

  if (name === "mark_quote_status") {
    const { error } = await supa.from("quotes").update({ status: input.status }).eq("id", input.quote_id).eq("business_id", businessId);
    return error ? { error: error.message } : { ok: true };
  }

  if (name === "set_lead_status") {
    const { error } = await supa.from("leads").update({ status: input.status }).eq("id", input.lead_id).eq("business_id", businessId);
    return error ? { error: error.message } : { ok: true };
  }

  return { error: `Unknown tool: ${name}` };
}

export async function POST(request: NextRequest) {
  // Bearer auth
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });

  // Build a supabase client that forwards this token — RLS scopes everything
  const supa = createSupaClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userErr } = await supa.auth.getUser(token);
  if (userErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { messages, business_id, context } = await request.json() as {
    messages: Anthropic.MessageParam[];
    business_id: string;
    context?: AgentSnapshot;
  };
  if (!business_id) return NextResponse.json({ error: "business_id required" }, { status: 400 });

  // Confirm membership — RLS will also reject but cleanest to fail fast
  const { data: businessOwn } = await supa.from("businesses").select("id, name").eq("id", business_id).maybeSingle();
  const { data: businessMember } = await supa.from("business_members").select("business_id").eq("business_id", business_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!businessOwn && !businessMember) return NextResponse.json({ error: "Not a member of this business" }, { status: 403 });
  const businessName = (businessOwn as { name: string } | null)?.name ?? "your business";

  const ctx: ToolContext = { supa, businessId: business_id, userId: user.id };

  const today = new Date().toISOString().split("T")[0];
  const system = `You are the on-the-go assistant for ${businessName}, a trades business.
Today is ${today}. The user is the owner or admin running ops from their phone.

Use the tools to look up customers, invoices, quotes, leads, briefings, today's schedule.
Be brief — phone screens are small. Lead with the answer, then key supporting numbers.
If asked to update something, confirm before calling write tools.
Money is in ${context?.business.currency ?? "AUD"} unless otherwise specified.

CONTINUITY: This conversation may continue across many turns. The full
prior message history (including your earlier tool calls and their
results) is provided to you. Use it. When the user says "that customer",
"the invoice we just made", "schedule it" — match the pronoun to
what you/they already worked on in earlier turns. Don't re-search
for something you already have an ID for from a previous tool call.${renderContext(context)}`;

  const allMessages: Anthropic.MessageParam[] = [...messages];
  let iterations = 0;
  while (iterations < 10) {
    iterations++;
    const response = await anthropic.messages.create({
      model: AI_MODELS.smart,
      max_tokens: 2048,
      system,
      tools: TOOLS,
      messages: allMessages,
    });

    // Only run tools when the model finished asking for them. A reply cut off
    // at max_tokens can end *inside* a tool_use block with partial input JSON,
    // and these tools write (mark_invoice_paid, set_lead_status).
    const canRunTools = response.stop_reason === "tool_use";
    if (!canRunTools) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // Never persist an unanswered tool_use: the client sends this history
      // back next turn, and a tool_use with no matching tool_result is a 400
      // that would wedge the conversation permanently. Drop those blocks, and
      // skip the turn entirely if nothing else is left.
      const keep = response.content.filter((b) => b.type !== "tool_use");
      if (keep.length > 0) allMessages.push({ role: "assistant", content: keep });

      const note =
        response.stop_reason === "max_tokens"
          ? "That reply was cut off because it hit the length limit. Nothing was run — try a narrower request."
          : response.stop_reason === "refusal"
            ? "I can't help with that request."
            : null;

      return NextResponse.json({
        text: note ? (text ? `${text}\n\n${note}` : note) : text,
        messages: allMessages,
      });
    }

    // Execute tool calls and feed results back
    allMessages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await runTool(block.name, block.input as Record<string, unknown>, ctx);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    allMessages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ text: "I ran out of steps. Try a simpler question.", messages: allMessages });
}

// ── Live context snapshot rendered into the system prompt ──────────────────

interface AgentSnapshot {
  business: { id: string; name: string; currency: string };
  stats:    {
    outstanding: number; overdue: number; jobs_today: number;
    draft_quotes: number; new_leads_7d: number;
  };
  recent_customers: Array<{ id: string; name: string; company: string | null }>;
  recent_invoices:  Array<{ id: string; number: string; status: string; total: number; balance: number; customer_name: string | null }>;
  recent_quotes:    Array<{ id: string; number: string; status: string; total: number; customer_name: string | null }>;
  todays_jobs:      Array<{ id: string; number: string; title: string; status: string; customer_name: string | null }>;
  open_leads:       Array<{ id: string; name: string; status: string; created_at: string }>;
}

function fmtMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${currency} ${n.toFixed(0)}`; }
}

function renderContext(ctx: AgentSnapshot | undefined): string {
  if (!ctx) return "";
  const c = ctx.business.currency;
  const lines: string[] = ["", "", "── LIVE BUSINESS CONTEXT ──",
    `Stats right now:`,
    `  • Outstanding: ${fmtMoney(ctx.stats.outstanding, c)}`,
    `  • Overdue: ${fmtMoney(ctx.stats.overdue, c)}`,
    `  • Jobs scheduled today: ${ctx.stats.jobs_today}`,
    `  • Draft quotes waiting to send: ${ctx.stats.draft_quotes}`,
    `  • New leads (last 7d): ${ctx.stats.new_leads_7d}`,
  ];

  if (ctx.recent_customers.length) {
    lines.push("", "Recent customers (use these IDs if the user means one of them):");
    for (const r of ctx.recent_customers) lines.push(`  • ${r.name}${r.company ? ` (${r.company})` : ""} — id ${r.id}`);
  }
  if (ctx.recent_invoices.length) {
    lines.push("", "Recent invoices:");
    for (const i of ctx.recent_invoices) {
      lines.push(`  • ${i.number} ${i.status} ${fmtMoney(i.total, c)}${i.balance > 0 ? ` (${fmtMoney(i.balance, c)} due)` : ""}${i.customer_name ? ` — ${i.customer_name}` : ""} — id ${i.id}`);
    }
  }
  if (ctx.recent_quotes.length) {
    lines.push("", "Recent quotes:");
    for (const q of ctx.recent_quotes) {
      lines.push(`  • ${q.number} ${q.status} ${fmtMoney(q.total, c)}${q.customer_name ? ` — ${q.customer_name}` : ""} — id ${q.id}`);
    }
  }
  if (ctx.todays_jobs.length) {
    lines.push("", "Today's jobs:");
    for (const w of ctx.todays_jobs) {
      lines.push(`  • ${w.number} ${w.status} — ${w.title}${w.customer_name ? ` (${w.customer_name})` : ""} — id ${w.id}`);
    }
  }
  if (ctx.open_leads.length) {
    lines.push("", "New leads:");
    for (const l of ctx.open_leads) lines.push(`  • ${l.name} (${l.status}) — id ${l.id}`);
  }

  lines.push("", "When the user says 'that customer', 'the invoice we just made',",
    "'today's jobs', 'this lead' — match to entries above first. Only run a",
    "search tool if nothing here matches.",
    "──────────────────────────────────");
  return lines.join("\n");
}
