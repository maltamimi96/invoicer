import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { createCustomer } from "@/lib/actions/customers";
import { createQuote } from "@/lib/actions/quotes";
import type { LineItem } from "@/types/database";
import { ilikeAcross } from "@/lib/pg-filter";

const anthropic = new Anthropic();

/** Multi-turn tool loop — without this the platform default applies and the
 *  function is killed mid-chain. */
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

interface QuotingContext {
  businessId:   string;
  businessName: string;
  currency:     string;
  settings:     {
    industries:               string[];
    default_hourly_rate:      number | null;
    default_margin_percent:   number | null;
    default_tax_rate:         number | null;
    call_out_fee:             number | null;
    emergency_rate_multiplier: number | null;
    estimation_mode:          "manual" | "ai_estimate" | "skip";
    business_notes:           string | null;
  };
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_knowledge",
    description: "Search the business's quoting knowledge bank for a fact (material price, labour rate, scope template, etc.). Use this FIRST before estimating or asking the user — it's how you remember what they've taught you.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Free-text search of the key column (case-insensitive substring)" },
        kind:  { type: "string", enum: ["material", "labour", "margin", "scope_template", "rate", "note"], description: "Optional filter by kind" },
        category: { type: "string", description: "Optional filter by category, e.g. 'plumbing'" },
      },
    },
  },
  {
    name: "save_knowledge",
    description: "Remember a new fact for next time. Use when the user teaches you a price, rate, or rule. Set source='user' for confirmed facts. If you're saving an estimate the user hasn't yet confirmed, use source='ai_estimate' and confirmed=false. Keys are case-insensitive and unique per (kind, key) — saving again with the same key updates the value.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind:     { type: "string", enum: ["material", "labour", "margin", "scope_template", "rate", "note"] },
        key:      { type: "string", description: "Short identifier, e.g. '1m copper pipe', 'tile installer hourly', 'standard deposit percent'" },
        value:    { type: "string", description: "The fact. Usually a number as text (e.g. '145.00' or '30')." },
        unit:     { type: "string", description: "Optional unit, e.g. 'per m', 'per hour', '%'" },
        category: { type: "string", description: "Optional category, usually one of the business's industries" },
        source:   { type: "string", enum: ["user", "ai_estimate"], description: "'user' if the user told you, 'ai_estimate' if you guessed" },
        confirmed: { type: "boolean", description: "False for unconfirmed estimates — UI will show a warning badge" },
        notes:    { type: "string", description: "Optional context worth keeping" },
      },
      required: ["kind", "key", "value"],
    },
  },
  {
    name: "update_knowledge",
    description: "Override an existing fact when the user tells you the old value was wrong. Pass the row id from a prior lookup_knowledge result.",
    input_schema: {
      type: "object" as const,
      properties: {
        id:    { type: "string" },
        value: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_knowledge",
    description: "Forget a fact when the user explicitly asks you to drop it.",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_knowledge",
    description: "Browse the whole knowledge bank or one category. Use for orientation when starting a new quote so you know what's already on file.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind:     { type: "string", enum: ["material", "labour", "margin", "scope_template", "rate", "note"] },
        category: { type: "string" },
      },
    },
  },
  {
    name: "search_customers",
    description: "Find an existing customer by name, email, or company. Always call before creating a new one.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "create_customer",
    description: "Mint a new customer if no match is found. Returns the id.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:    { type: "string" },
        email:   { type: "string" },
        phone:   { type: "string" },
        address: { type: "string" },
        city:    { type: "string" },
        company: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_quote",
    description: "Create a draft quote in the business's current quote system. Pass the customer_id from search/create, the line items (each with name, description, quantity, unit_price, tax_rate), optional notes/terms. The quote_number is minted automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "From search_customers / create_customer" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name:        { type: "string" },
              description: { type: "string" },
              quantity:    { type: "number" },
              unit_price:  { type: "number", description: "Ex-tax unit price" },
              tax_rate:    { type: "number", description: "Percent; defaults to the business's default_tax_rate if omitted" },
            },
            required: ["name", "quantity", "unit_price"],
          },
        },
        notes:        { type: "string" },
        terms:        { type: "string" },
        expiry_days:  { type: "number", description: "Default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>, ctx: QuotingContext): Promise<unknown> {
  const supabase = await createClient();
  const businessId = ctx.businessId;

  if (name === "lookup_knowledge") {
    const q = String(input.query ?? "").trim();
    let query = tbl(supabase, "quoting_agent_knowledge")
      .select("*")
      .eq("business_id", businessId)
      .limit(20);
    if (input.kind)     query = query.eq("kind", input.kind);
    if (input.category) query = query.eq("category", input.category);
    if (q)              query = query.ilike("key", `%${q}%`);
    const { data } = await query;
    return data ?? [];
  }

  if (name === "list_knowledge") {
    let query = tbl(supabase, "quoting_agent_knowledge")
      .select("*")
      .eq("business_id", businessId)
      .order("kind").order("key")
      .limit(200);
    if (input.kind)     query = query.eq("kind", input.kind);
    if (input.category) query = query.eq("category", input.category);
    const { data } = await query;
    return data ?? [];
  }

  if (name === "save_knowledge") {
    const { data, error } = await tbl(supabase, "quoting_agent_knowledge")
      .upsert({
        business_id: businessId,
        kind: input.kind,
        key:  String(input.key).trim().toLowerCase(),
        value: input.value,
        unit: input.unit ?? null,
        category: input.category ?? null,
        source: input.source ?? "ai_estimate",
        notes: input.notes ?? null,
        confirmed: input.confirmed ?? (input.source !== "ai_estimate"),
      }, { onConflict: "business_id,kind,key" })
      .select("*").single();
    if (error) return { error: error.message };
    return data;
  }

  if (name === "update_knowledge") {
    const patch: Record<string, unknown> = {};
    if (typeof input.value === "string") patch.value = input.value;
    if (typeof input.notes === "string") patch.notes = input.notes;
    patch.confirmed = true; // edits always confirm
    const { error } = await tbl(supabase, "quoting_agent_knowledge")
      .update(patch).eq("id", input.id).eq("business_id", businessId);
    return error ? { error: error.message } : { ok: true };
  }

  if (name === "delete_knowledge") {
    const { error } = await tbl(supabase, "quoting_agent_knowledge")
      .delete().eq("id", input.id).eq("business_id", businessId);
    return error ? { error: error.message } : { ok: true };
  }

  if (name === "search_customers") {
    const q = String(input.query ?? "").trim();
    const { data } = await tbl(supabase, "customers")
      .select("id, name, email, phone, company")
      .eq("business_id", businessId).eq("archived", false)
      .or(ilikeAcross(["name", "email", "company"], q))
      .limit(10);
    return data ?? [];
  }

  if (name === "create_customer") {
    const c = await createCustomer({
      name:       String(input.name),
      email:      (input.email   as string | undefined) ?? null,
      phone:      (input.phone   as string | undefined) ?? null,
      address:    (input.address as string | undefined) ?? null,
      city:       (input.city    as string | undefined) ?? null,
      state:      null,
      postcode:   null,
      country:    null,
      company:    (input.company as string | undefined) ?? null,
      tax_number: null,
      notes:      null,
      archived:   false,
    });
    return { id: c.id, name: c.name };
  }

  if (name === "create_quote") {
    const rawItems = (input.line_items as Array<{
      name: string; description?: string; quantity: number; unit_price: number; tax_rate?: number;
    }>) ?? [];
    const defaultTax = ctx.settings.default_tax_rate ?? 10;
    const items: LineItem[] = rawItems.map((li) => {
      const qty = Number(li.quantity) || 0;
      const price = Number(li.unit_price) || 0;
      const taxRate = li.tax_rate ?? defaultTax;
      const sub = qty * price;
      const tax = sub * (taxRate / 100);
      return {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `li_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: li.name,
        description: li.description ?? "",
        quantity: qty,
        unit_price: price,
        tax_rate: taxRate,
        discount_percent: 0,
        subtotal: sub,
        tax_amount: tax,
        total: sub + tax,
      };
    });
    const subtotal = items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const tax_total = items.reduce((s, li) => s + li.quantity * li.unit_price * (li.tax_rate / 100), 0);
    const issue_date = new Date().toISOString().split("T")[0];
    const expiry_days = (input.expiry_days as number) ?? 30;
    const expiry_date = new Date(Date.now() + expiry_days * 86_400_000).toISOString().split("T")[0];

    const quote = await createQuote({
      status: "draft",
      customer_id: String(input.customer_id),
      issue_date,
      expiry_date,
      line_items: items,
      subtotal,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_total,
      total: subtotal + tax_total,
      notes: (input.notes as string) ?? null,
      terms: (input.terms as string) ?? null,
      invoice_id: null,
      site_id: null,
      property_address: null,
    });
    return { quote_id: quote.id, quote_number: quote.number, total: subtotal + tax_total };
  }

  return { error: `Unknown tool: ${name}` };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const [{ data: biz }, { data: settings }] = await Promise.all([
    tbl(supabase, "businesses").select("name, currency").eq("id", businessId).single(),
    tbl(supabase, "quoting_agent_settings").select("*").eq("business_id", businessId).maybeSingle(),
  ]);

  if (!settings || !settings.enabled) {
    return NextResponse.json({ error: "Quoting Agent isn't enabled for this business." }, { status: 400 });
  }

  const ctx: QuotingContext = {
    businessId,
    businessName: biz?.name ?? "your business",
    currency: biz?.currency ?? "AUD",
    settings,
  };

  const { messages } = await request.json() as { messages: Anthropic.MessageParam[] };

  const today = new Date().toISOString().split("T")[0];
  const system = `You are the Quoting Agent for ${ctx.businessName}, a trades business.
Today is ${today}. Your job: turn natural-language briefs from the user into accurate, professional quotes — using the business's own pricing knowledge bank as the source of truth.

== HOW TO PRICE ==

Always work in this order:
1. **Look up first.** Before estimating ANY price or rate, call lookup_knowledge to see if it's already on file. The user has been teaching you — use what they've taught.
2. **Apply business defaults** where applicable:
   - Default hourly rate: ${ctx.settings.default_hourly_rate ?? "(not set)"} ${ctx.currency}/hr
   - Default margin: ${ctx.settings.default_margin_percent ?? "(not set)"}%
   - Default tax rate: ${ctx.settings.default_tax_rate ?? 10}%
   - Call-out fee: ${ctx.settings.call_out_fee ?? "(not set)"} ${ctx.currency}
   - Emergency multiplier: ${ctx.settings.emergency_rate_multiplier ?? 1.5}× the hourly rate
3. **For unknown items, behave according to estimation_mode = "${ctx.settings.estimation_mode}":**
   - **manual**: ask the user for the price. Do NOT estimate.
   - **ai_estimate**: estimate from your general knowledge of the industry/locale, then call save_knowledge with source='ai_estimate' and confirmed=false so the user can confirm later. Tell the user it's an estimate.
   - **skip**: leave unit_price at 0 with a note "(price tbd)" and tell the user to fill it in.

== INDUSTRIES THE BUSINESS WORKS IN ==
${ctx.settings.industries.length ? ctx.settings.industries.join(", ") : "(none specified yet)"}

== HOUSE NOTES THE USER WANTS YOU TO REMEMBER ==
${ctx.settings.business_notes ?? "(none)"}

== MEMORY ==

You have continuous memory across this whole conversation — including every tool you've called and every result you've seen. When the user says "that customer", "those line items", "the rate we just discussed", scroll back through what you already know before searching again.

When the user teaches you something new ("we charge $145/hr for journeymen") immediately call save_knowledge with source='user'. When they correct an existing fact, call update_knowledge with the row id from a prior lookup.

== QUOTE GENERATION ==

When the brief is clear enough to quote:
1. search_customers (or create_customer if new)
2. Build line items with itemised labour + materials
3. Apply margin where appropriate (build into unit_price)
4. Call create_quote with the customer_id and items
5. Reply with the quote number, total, and a 1-line summary

Money is in ${ctx.currency}. Be concise — the user reads on a phone or has the chat open beside their actual work.`;

  // Multi-turn tool loop (same pattern as /api/agent)
  const allMessages: Anthropic.MessageParam[] = [...messages];
  let iterations = 0;
  while (iterations < 12) {
    iterations++;
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages: allMessages,
    });

    // Only run tools when the model finished asking for them — a reply cut off
    // at max_tokens can end inside a tool_use block with partial input JSON.
    const canRunTools = response.stop_reason === "tool_use";
    if (!canRunTools) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // Never persist an unanswered tool_use — the client sends this history
      // back next turn and it would 400, wedging the conversation.
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

  return NextResponse.json({ text: "I hit my tool-call limit. Try a smaller brief.", messages: allMessages });
}
