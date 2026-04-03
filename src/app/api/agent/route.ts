import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { createWorkOrder, updateWorkOrderStatus } from "@/lib/actions/work-orders";
import { createQuote, updateQuote, sendQuoteEmail, convertQuoteToInvoice } from "@/lib/actions/quotes";
import { createInvoice, updateInvoice, sendInvoiceEmail, addPayment } from "@/lib/actions/invoices";
import { getProducts, createProduct } from "@/lib/actions/products";
import { createReport } from "@/lib/actions/reports";
import { v4 as uuidv4 } from "uuid";
import type { LineItem } from "@/types/database";

const anthropic = new Anthropic();

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Customers ──────────────────────────────────────────────────────────────
  {
    name: "search_customers",
    description: "Search for existing customers by name, email, or company. Always call this before creating a new customer to avoid duplicates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name, email, or company to search" },
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
        name: { type: "string" },
        company: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_customer",
    description: "Update an existing customer's details",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        name: { type: "string" },
        company: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        postcode: { type: "string" },
        country: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_customer_details",
    description: "Get a customer's full details including their recent work orders, quotes, and invoices",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
      },
      required: ["customer_id"],
    },
  },

  // ── Products ───────────────────────────────────────────────────────────────
  {
    name: "search_products",
    description: "Search the product/service catalog by name. Use this to find stored items and their prices before creating quotes.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Product name or keyword to search. Use empty string to list all products." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_product",
    description: "Add a new product or service to the catalog with a set price",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        unit_price: { type: "number", description: "Price excluding tax" },
        tax_rate: { type: "number", description: "Tax rate as percentage, e.g. 10 for 10%" },
        unit: { type: "string", description: "Unit of measure, e.g. 'ea', 'hr', 'm2'" },
      },
      required: ["name", "unit_price"],
    },
  },

  // ── Work Orders ────────────────────────────────────────────────────────────
  {
    name: "create_work_order",
    description: "Create a new work order for a job",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        customer_id: { type: "string" },
        property_address: { type: "string" },
        scheduled_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_work_order_status",
    description: "Update the status of a work order",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id: { type: "string" },
        status: {
          type: "string",
          enum: ["draft", "assigned", "in_progress", "submitted", "completed", "cancelled"],
        },
      },
      required: ["work_order_id", "status"],
    },
  },
  {
    name: "list_work_orders",
    description: "List work orders, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["draft", "assigned", "in_progress", "submitted", "completed", "cancelled"],
        },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },

  // ── Quotes ─────────────────────────────────────────────────────────────────
  {
    name: "create_quote",
    description: "Create a quote for a customer. Search the product catalog first to use stored prices. If products don't exist, ask the user for prices or use reasonable estimates.",
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
              unit_price: { type: "number", description: "Price excluding tax" },
              tax_rate: { type: "number", description: "Tax rate %, default 10" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        terms: { type: "string" },
        expiry_days: { type: "number", description: "Days until expiry, default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "list_quotes",
    description: "List recent quotes, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },
  {
    name: "send_quote_email",
    description: "Email a quote PDF to the customer. Customer must have an email address.",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },
  {
    name: "update_quote_status",
    description: "Update a quote's status, e.g. mark it as accepted or rejected",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] },
      },
      required: ["quote_id", "status"],
    },
  },
  {
    name: "convert_quote_to_invoice",
    description: "Convert an accepted quote into an invoice",
    input_schema: {
      type: "object" as const,
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
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
    name: "list_invoices",
    description: "List recent invoices, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled", "partial"] },
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },
  {
    name: "send_invoice_email",
    description: "Email an invoice PDF to the customer",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: { type: "string" },
      },
      required: ["invoice_id"],
    },
  },
  {
    name: "record_payment",
    description: "Record a payment received against an invoice",
    input_schema: {
      type: "object" as const,
      properties: {
        invoice_id: { type: "string" },
        amount: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        method: { type: "string", description: "e.g. Bank transfer, Cash, Card" },
        reference: { type: "string" },
      },
      required: ["invoice_id", "amount"],
    },
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  {
    name: "create_report",
    description: "Create a new roof inspection report (draft) for a customer and property",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Report title, e.g. 'Roof Inspection — 42 Smith St'" },
        customer_id: { type: "string" },
        property_address: { type: "string" },
        inspection_date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        roof_type: { type: "string", description: "e.g. Colorbond, Terracotta tile, Concrete tile" },
        inspector_name: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_reports",
    description: "List recent inspection reports, optionally filtered by customer",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        limit: { type: "number", description: "Max results, default 10" },
      },
    },
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    name: "navigate_to",
    description: "Navigate the user to a page after completing a task",
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

// ── Tool labels ──────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_customers: "Searching customers",
  create_customer: "Creating customer",
  update_customer: "Updating customer",
  get_customer_details: "Loading customer details",
  search_products: "Searching product catalog",
  create_product: "Adding product to catalog",
  create_work_order: "Creating work order",
  update_work_order_status: "Updating work order status",
  list_work_orders: "Fetching work orders",
  create_quote: "Creating quote",
  list_quotes: "Fetching quotes",
  send_quote_email: "Sending quote email",
  update_quote_status: "Updating quote",
  convert_quote_to_invoice: "Converting quote to invoice",
  create_invoice: "Creating invoice",
  list_invoices: "Fetching invoices",
  send_invoice_email: "Sending invoice email",
  record_payment: "Recording payment",
  create_report: "Creating inspection report",
  list_reports: "Fetching reports",
  navigate_to: "Navigating",
};

// ── Line item builder ────────────────────────────────────────────────────────

function buildLineItems(
  raw: Array<{ name: string; description?: string; quantity?: number; unit_price: number; tax_rate?: number }>
): LineItem[] {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getRawSupabase = async () => {
    const sb = await createClient();
    return sb as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  switch (name) {
    // ── Customers ────────────────────────────────────────────────────────────
    case "search_customers": {
      const sb = await getRawSupabase();
      const { data } = await sb
        .from("customers")
        .select("id, name, company, email, phone")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%,company.ilike.%${input.query}%`)
        .limit(8);
      return { customers: data ?? [], count: (data ?? []).length };
    }

    case "create_customer": {
      const c = await createCustomer({
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
      return { id: c.id, name: c.name, email: c.email, message: `Customer "${c.name}" created` };
    }

    case "update_customer": {
      const { customer_id, ...fields } = input;
      await updateCustomer(customer_id, fields);
      return { message: "Customer updated" };
    }

    case "get_customer_details": {
      const sb = await getRawSupabase();
      const [customerRes, quotesRes, invoicesRes, workOrdersRes] = await Promise.all([
        sb.from("customers").select("*").eq("id", input.customer_id).eq("business_id", ctx.businessId).single(),
        sb.from("quotes").select("id, number, status, total, issue_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("invoices").select("id, number, status, total, due_date, amount_paid").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        sb.from("work_orders").select("id, number, title, status, scheduled_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        customer: customerRes.data,
        recent_quotes: quotesRes.data ?? [],
        recent_invoices: invoicesRes.data ?? [],
        recent_work_orders: workOrdersRes.data ?? [],
      };
    }

    // ── Products ─────────────────────────────────────────────────────────────
    case "search_products": {
      const all = await getProducts(false);
      const q = (input.query ?? "").toLowerCase();
      const results = q
        ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
        : all;
      return { products: results.slice(0, 10), count: results.length };
    }

    case "create_product": {
      const p = await createProduct({
        name: input.name,
        description: input.description ?? null,
        unit_price: input.unit_price,
        tax_rate: input.tax_rate ?? 10,
        unit: input.unit ?? null,
        archived: false,
      } as Parameters<typeof createProduct>[0]);
      return { id: p.id, name: p.name, unit_price: p.unit_price, message: `Product "${p.name}" added to catalog` };
    }

    // ── Work Orders ───────────────────────────────────────────────────────────
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

    case "update_work_order_status": {
      await updateWorkOrderStatus(input.work_order_id, input.status);
      return { message: `Work order status updated to ${input.status}` };
    }

    case "list_work_orders": {
      const sb = await getRawSupabase();
      let q = sb
        .from("work_orders")
        .select("id, number, title, status, property_address, scheduled_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { work_orders: data ?? [], count: (data ?? []).length };
    }

    // ── Quotes ────────────────────────────────────────────────────────────────
    case "create_quote": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const quote = await createQuote({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        expiry_date: addDays(input.expiry_days ?? 30),
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
      return { id: quote.id, number: quote.number, total, message: `Quote ${quote.number} created — $${total.toFixed(2)} total` };
    }

    case "list_quotes": {
      const sb = await getRawSupabase();
      let q = sb
        .from("quotes")
        .select("id, number, status, total, issue_date, expiry_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { quotes: data ?? [], count: (data ?? []).length };
    }

    case "send_quote_email": {
      await sendQuoteEmail(input.quote_id);
      return { message: "Quote emailed to customer" };
    }

    case "update_quote_status": {
      await updateQuote(input.quote_id, { status: input.status });
      return { message: `Quote marked as ${input.status}` };
    }

    case "convert_quote_to_invoice": {
      const invoice = await convertQuoteToInvoice(input.quote_id);
      return { id: invoice.id, number: invoice.number, message: `Invoice ${invoice.number} created from quote` };
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    case "create_invoice": {
      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const invoice = await createInvoice({
        customer_id: input.customer_id,
        status: "draft",
        issue_date: today,
        due_date: addDays(input.due_days ?? 30),
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
      return { id: invoice.id, number: invoice.number, total, message: `Invoice ${invoice.number} created — $${total.toFixed(2)} total` };
    }

    case "list_invoices": {
      const sb = await getRawSupabase();
      let q = sb
        .from("invoices")
        .select("id, number, status, total, due_date, amount_paid, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { invoices: data ?? [], count: (data ?? []).length };
    }

    case "send_invoice_email": {
      await sendInvoiceEmail(input.invoice_id);
      return { message: "Invoice emailed to customer" };
    }

    case "record_payment": {
      await addPayment(input.invoice_id, {
        amount: input.amount,
        date: input.date ?? new Date().toISOString().split("T")[0],
        method: input.method ?? null,
        reference: input.reference ?? null,
      });
      return { message: `Payment of $${input.amount} recorded` };
    }

    // ── Reports ───────────────────────────────────────────────────────────────
    case "create_report": {
      const report = await createReport({
        title: input.title,
        customer_id: input.customer_id ?? null,
        property_address: input.property_address ?? undefined,
        inspection_date: input.inspection_date ?? new Date().toISOString().split("T")[0],
        meta: {
          roof_type: input.roof_type ?? "",
          inspector_name: input.inspector_name ?? "",
        },
      });
      return { id: report.id, title: report.title, message: `Inspection report "${report.title}" created as draft` };
    }

    case "list_reports": {
      const sb = await getRawSupabase();
      let q = sb
        .from("reports")
        .select("id, title, status, property_address, inspection_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { reports: data ?? [], count: (data ?? []).length };
    }

    case "navigate_to":
      return { navigating: true, path: input.path };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(businessName: string): string {
  return `You are a powerful AI assistant built into ${businessName}'s business management app. You have full access to every feature of the system.

CAPABILITIES — you can use all of these:
- Customers: search, create, update, view full history
- Product catalog: search products (with stored prices), add new products
- Work orders: create, list, update status
- Quotes: create (using catalog prices), send by email, update status, convert to invoice, list
- Invoices: create, send by email, record payments, list
- Inspection reports: create draft reports, list reports

WORKFLOW RULES:
1. Always search for an existing customer before creating one.
2. For quotes/invoices: always search the product catalog first. If matching products exist, use their stored prices. If not, ask the user for prices, or make a reasonable estimate and tell the user what you assumed.
3. After creating any record, state its number (e.g. QT-0004, WO-0012).
4. After a multi-step task, give a short summary of everything created.
5. Use navigate_to after creating important records so the user can open them.
6. Never say you "don't have access" to a feature — you have access to everything listed above.

Today's date: ${new Date().toISOString().split("T")[0]}`;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

        while (iterations < 15) {
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
