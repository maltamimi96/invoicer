import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { createCustomer } from "@/lib/actions/customers";
import { createWorkOrder } from "@/lib/actions/work-orders";
import { createQuote, sendQuoteEmail } from "@/lib/actions/quotes";
import { createInvoice, sendInvoiceEmail } from "@/lib/actions/invoices";
import { v4 as uuidv4 } from "uuid";
import type { LineItem } from "@/types/database";

const anthropic = new Anthropic();

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_customers",
    description: "Search for existing customers by name, email, or company. Always call this before creating a new customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name, email, or company to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer record",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Full name" },
        company: { type: "string", description: "Company name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_work_order",
    description: "Create a work order for a job",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short job title" },
        description: { type: "string", description: "Job description or scope" },
        customer_id: { type: "string", description: "Customer ID" },
        property_address: { type: "string", description: "Site/property address" },
        scheduled_date: { type: "string", description: "Scheduled date in YYYY-MM-DD format" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_quote",
    description: "Create a quote for a customer. Ask for line items and prices if not provided.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer ID" },
        line_items: {
          type: "array",
          description: "List of items/services to quote",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number", description: "Price excluding tax" },
              tax_rate: { type: "number", description: "Tax rate as percentage, e.g. 10 for 10%" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string", description: "Scope of works or notes to client" },
        terms: { type: "string", description: "Payment terms" },
        expiry_days: { type: "number", description: "Days until quote expires, default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "send_quote_email",
    description: "Send a quote to the customer by email. Customer must have an email address.",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },
  {
    name: "create_invoice",
    description: "Create an invoice for a customer",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              tax_rate: { type: "number" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        terms: { type: "string" },
        due_days: { type: "number", description: "Days until due, default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "send_invoice_email",
    description: "Send an invoice to the customer by email",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: { type: "string" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "get_summary",
    description: "Get a summary of recent activity — recent quotes, invoices, and work orders",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Optional: filter by customer" },
      },
    },
  },
  {
    name: "navigate_to",
    description: "Navigate the user to a specific page after completing a task",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "App path, e.g. /quotes/123 or /customers/456" },
        label: { type: "string", description: "Human-readable label, e.g. 'Quote QT-0004'" },
      },
      required: ["path", "label"],
    },
  },
];

// ── Tool labels for UI ───────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_customers: "Searching customers",
  create_customer: "Creating customer",
  create_work_order: "Creating work order",
  create_quote: "Creating quote",
  send_quote_email: "Sending quote email",
  create_invoice: "Creating invoice",
  send_invoice_email: "Sending invoice email",
  get_summary: "Fetching activity",
  navigate_to: "Navigating",
};

// ── Line item calculator ─────────────────────────────────────────────────────

function buildLineItems(raw: Array<{ name: string; description?: string; quantity?: number; unit_price: number; tax_rate?: number }>): LineItem[] {
  return raw.map((item) => {
    const quantity = item.quantity ?? 1;
    const unit_price = item.unit_price;
    const tax_rate = item.tax_rate ?? 10;
    const subtotal = quantity * unit_price;
    const tax_amount = (subtotal * tax_rate) / 100;
    return {
      id: uuidv4(),
      name: item.name,
      description: item.description ?? "",
      quantity,
      unit_price,
      tax_rate,
      discount_percent: 0,
      subtotal,
      tax_amount,
      total: subtotal + tax_amount,
    };
  });
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── Tool executor ────────────────────────────────────────────────────────────

interface ToolContext {
  businessId: string;
}

async function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case "search_customers": {
      const supabase = await createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("customers")
        .select("id, name, company, email, phone")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%,company.ilike.%${input.query}%`)
        .limit(5);
      return { customers: data ?? [], count: (data ?? []).length };
    }

    case "create_customer": {
      const customer = await createCustomer({
        name: input.name,
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        tax_number: null,
        notes: null,
        archived: false,
      });
      return { id: customer.id, name: customer.name, email: customer.email, message: `Customer "${customer.name}" created` };
    }

    case "create_work_order": {
      const wo = await createWorkOrder({
        title: input.title,
        description: input.description ?? undefined,
        customer_id: input.customer_id ?? null,
        property_address: input.property_address ?? undefined,
        scheduled_date: input.scheduled_date ?? null,
      });
      return { id: wo.id, number: wo.number, title: wo.title, message: `Work order ${wo.number} created` };
    }

    case "create_quote": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];
      const expiryDate = addDays(input.expiry_days ?? 30);

      const quote = await createQuote({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        expiry_date: expiryDate,
        line_items: lineItems as unknown as LineItem[],
        subtotal,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        tax_total: taxTotal,
        total,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        invoice_id: null,
      });
      return { id: quote.id, number: quote.number, total, message: `Quote ${quote.number} created for $${total.toFixed(2)}` };
    }

    case "send_quote_email": {
      await sendQuoteEmail(input.quote_id);
      return { message: "Quote email sent successfully" };
    }

    case "create_invoice": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];
      const dueDate = addDays(input.due_days ?? 30);

      const invoice = await createInvoice({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        due_date: dueDate,
        line_items: lineItems as unknown as LineItem[],
        subtotal,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        tax_total: taxTotal,
        total,
        amount_paid: 0,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
      });
      return { id: invoice.id, number: invoice.number, total, message: `Invoice ${invoice.number} created for $${total.toFixed(2)}` };
    }

    case "send_invoice_email": {
      await sendInvoiceEmail(input.invoice_id);
      return { message: "Invoice email sent successfully" };
    }

    case "get_summary": {
      const supabase = await createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const [quotesRes, invoicesRes, workOrdersRes] = await Promise.all([
        sb.from("quotes").select("id, number, status, total, customers(name)").eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("invoices").select("id, number, status, total, customers(name)").eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("work_orders").select("id, number, title, status, customers(name)").eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
      ]);

      return {
        recent_quotes: quotesRes.data ?? [],
        recent_invoices: invoicesRes.data ?? [],
        recent_work_orders: workOrdersRes.data ?? [],
      };
    }

    case "navigate_to":
      // Client handles navigation — we just acknowledge it
      return { navigating: true, path: input.path };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(businessName: string): string {
  return `You are an AI assistant built into ${businessName}'s invoicing and job management app. You help create customers, work orders, quotes, and invoices, and can send emails to clients.

Guidelines:
- Always search for existing customers before creating new ones.
- If line items or prices are not provided for a quote/invoice, ask for them before proceeding.
- After creating records, always mention the record number (e.g. "Quote QT-0004").
- After completing a multi-step task, give a brief summary of what was done.
- Be concise and professional. No filler phrases.
- Today's date: ${new Date().toISOString().split("T")[0]}`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const businessId = await getActiveBizId(supabase, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business } = await (supabase as any).from("businesses").select("name").eq("id", businessId).single();

  const { messages } = await request.json() as { messages: Anthropic.MessageParam[] };

  const ctx: ToolContext = { businessId };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const allMessages = [...messages];
        let iterations = 0;

        while (iterations < 10) {
          iterations++;

          const response = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            system: buildSystemPrompt(business?.name ?? "your business"),
            tools: TOOLS,
            messages: allMessages,
          });

          const assistantContent = response.content;
          let hasToolUse = false;
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of assistantContent) {
            if (block.type === "text" && block.text) {
              send({ type: "text", content: block.text });
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              send({
                type: "tool_start",
                id: block.id,
                name: block.name,
                label: TOOL_LABELS[block.name] ?? block.name,
                input: block.input,
              });

              try {
                const result = await executeTool(block.name, block.input as Record<string, unknown>, ctx);

                // Navigate events need special handling on client
                if (block.name === "navigate_to") {
                  const inp = block.input as { path: string; label: string };
                  send({ type: "navigate", path: inp.path, label: inp.label });
                }

                send({ type: "tool_done", id: block.id, name: block.name, result });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err) {
                const error = err instanceof Error ? err.message : "Tool failed";
                send({ type: "tool_error", id: block.id, name: block.name, error });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Error: ${error}`,
                  is_error: true,
                });
              }
            }
          }

          allMessages.push({ role: "assistant", content: assistantContent });

          if (!hasToolUse || response.stop_reason === "end_turn") break;

          allMessages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
