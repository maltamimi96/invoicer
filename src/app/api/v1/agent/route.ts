/**
 * POST /api/v1/agent
 *
 * Internal API endpoint — allows external applications (Telegram bot, etc.)
 * to interact with the Invoicer using natural language.
 *
 * Security:
 *   - API key required: X-API-Key header must match INTERNAL_API_KEY env var
 *   - Rate limiting: 30 requests per 5 minutes per IP
 *   - Request validation: message required, max 2000 chars
 *   - Service role Supabase client (no user session needed)
 *   - Errors never leak internal details
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";
import type { LineItem } from "@/types/database";

// ── Rate limiter ─────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || !key) return false;
  // Constant-time comparison to prevent timing attacks
  if (key.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < key.length; i++) {
    mismatch |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Tenant scope ─────────────────────────────────────────────────────────────
// The agent is scoped to Crown Roofers only. Using env vars with fallback to
// the known IDs. This is not a secret — security comes from INTERNAL_API_KEY.
const AGENT_BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";
const AGENT_USER_ID     = process.env.AGENT_USER_ID     ?? "85e6a4dd-10b4-4ed9-a31c-b258ed784f2e";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function err(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status });
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_customers",
    description: "Search for existing customers by name, email, or company. Always call this before creating a new customer.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
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
      },
      required: ["name"],
    },
  },
  {
    name: "get_customer_details",
    description: "Get a customer's full details including recent quotes, invoices, and work orders",
    input_schema: {
      type: "object" as const,
      properties: { customer_id: { type: "string" } },
      required: ["customer_id"],
    },
  },
  {
    name: "search_products",
    description: "Search the product/service catalog. Use empty string to list all.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
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
    name: "list_work_orders",
    description: "List work orders, optionally filtered by status",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "assigned", "in_progress", "submitted", "completed", "cancelled"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "create_quote",
    description: "Create a quote for a customer. Search the product catalog first for stored prices.",
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
              tax_rate: { type: "number", description: "Default 10" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        expiry_days: { type: "number", description: "Default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "list_quotes",
    description: "List quotes, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] },
        customer_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "send_quote_email",
    description: "Email a quote to the customer. Customer must have an email address.",
    input_schema: {
      type: "object" as const,
      properties: { quote_id: { type: "string" } },
      required: ["quote_id"],
    },
  },
  {
    name: "convert_quote_to_invoice",
    description: "Convert an accepted quote into an invoice",
    input_schema: {
      type: "object" as const,
      properties: { quote_id: { type: "string" } },
      required: ["quote_id"],
    },
  },
  {
    name: "create_invoice",
    description: "Create an invoice directly for a customer",
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
              quantity: { type: "number" },
              unit_price: { type: "number" },
              tax_rate: { type: "number" },
            },
            required: ["name", "unit_price"],
          },
        },
        notes: { type: "string" },
        due_days: { type: "number", description: "Default 30" },
      },
      required: ["customer_id", "line_items"],
    },
  },
  {
    name: "list_invoices",
    description: "List invoices, optionally filtered by status or customer",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled", "partial"] },
        customer_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "send_invoice_email",
    description: "Email an invoice to the customer",
    input_schema: {
      type: "object" as const,
      properties: { invoice_id: { type: "string" } },
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
  {
    name: "create_report",
    description: "Create a roof inspection report draft",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        customer_id: { type: "string" },
        property_address: { type: "string" },
        inspection_date: { type: "string", description: "YYYY-MM-DD" },
        roof_type: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_reports",
    description: "List inspection reports",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_schedule",
    description: "Get scheduled jobs for a date or date range. Use today's date for daily overview.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date:   { type: "string", description: "YYYY-MM-DD, defaults to start_date" },
      },
      required: ["start_date"],
    },
  },
  {
    name: "assign_job_workers",
    description: "Assign one or more workers to a scheduled job (work order). Replaces existing assignments.",
    input_schema: {
      type: "object" as const,
      properties: {
        work_order_id:      { type: "string" },
        member_profile_ids: { type: "array", items: { type: "string" }, description: "Array of member profile IDs to assign" },
      },
      required: ["work_order_id", "member_profile_ids"],
    },
  },
  {
    name: "list_team_profiles",
    description: "List active team member profiles (workers) with their IDs, names and roles",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_leads",
    description: "List leads from the pipeline, optionally filtered by status",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["new", "contacted", "quoted", "won", "lost"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_lead_status",
    description: "Move a lead to a different pipeline stage",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        status: { type: "string", enum: ["new", "contacted", "quoted", "won", "lost"] },
      },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "update_lead",
    description: "Update a lead's details (notes, service, suburb, etc.)",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "string" },
        notes: { type: "string" },
        service: { type: "string" },
        suburb: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        timing: { type: "string" },
        property_type: { type: "string" },
      },
      required: ["lead_id"],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

interface BizContext {
  businessId: string;
  userId: string;
  businessName: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: Record<string, any>, ctx: BizContext): Promise<unknown> {
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (table: string) => (sb as any).from(table);

  switch (name) {
    // ── Customers ─────────────────────────────────────────────────────────────
    case "search_customers": {
      const { data } = await tbl("customers")
        .select("id, name, company, email, phone, address")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .or(`name.ilike.%${input.query}%,email.ilike.%${input.query}%,company.ilike.%${input.query}%`)
        .limit(8);
      return { customers: data ?? [], count: (data ?? []).length };
    }

    case "create_customer": {
      const { data, error } = await tbl("customers")
        .insert({
          name: input.name,
          company: input.company ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          postcode: input.postcode ?? null,
          country: input.country ?? "Australia",
          archived: false,
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, name, email")
        .single();
      if (error) throw new Error(`Failed to create customer: ${error.message}`);
      return { id: data.id, name: data.name, email: data.email, message: `Customer "${data.name}" created` };
    }

    case "get_customer_details": {
      const [customerRes, quotesRes, invoicesRes, workOrdersRes] = await Promise.all([
        tbl("customers").select("*").eq("id", input.customer_id).eq("business_id", ctx.businessId).single(),
        tbl("quotes").select("id, number, status, total, issue_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        tbl("invoices").select("id, number, status, total, due_date, amount_paid").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
        tbl("work_orders").select("id, number, title, status, scheduled_date").eq("customer_id", input.customer_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        customer: customerRes.data,
        recent_quotes: quotesRes.data ?? [],
        recent_invoices: invoicesRes.data ?? [],
        recent_work_orders: workOrdersRes.data ?? [],
      };
    }

    // ── Products ──────────────────────────────────────────────────────────────
    case "search_products": {
      const { data } = await tbl("products")
        .select("id, name, description, unit_price, unit, tax_rate")
        .eq("business_id", ctx.businessId)
        .eq("archived", false)
        .order("name");
      const q = (input.query ?? "").toLowerCase();
      const results = q
        ? (data ?? []).filter((p: { name: string; description?: string }) =>
            p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q)
          )
        : (data ?? []);
      return { products: results.slice(0, 10), count: results.length };
    }

    // ── Work orders ───────────────────────────────────────────────────────────
    case "create_work_order": {
      const { data: biz } = await tbl("businesses")
        .select("work_order_prefix, work_order_next_number")
        .eq("id", ctx.businessId)
        .single();
      const number = `${biz?.work_order_prefix ?? "WO"}-${String(biz?.work_order_next_number ?? 1).padStart(4, "0")}`;
      await tbl("businesses").update({ work_order_next_number: (biz?.work_order_next_number ?? 1) + 1 }).eq("id", ctx.businessId);
      const { data, error } = await tbl("work_orders")
        .insert({
          title: input.title,
          description: input.description ?? null,
          customer_id: input.customer_id ?? null,
          property_address: input.property_address ?? null,
          scheduled_date: input.scheduled_date ?? null,
          status: "draft",
          number,
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, number, title")
        .single();
      if (error) throw new Error(`Failed to create work order: ${error.message}`);
      return { id: data.id, number: data.number, title: data.title, message: `Work order ${data.number} created` };
    }

    case "list_work_orders": {
      let q = tbl("work_orders")
        .select("id, number, title, status, property_address, scheduled_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.status) q = q.eq("status", input.status);
      const { data } = await q;
      return { work_orders: data ?? [], count: (data ?? []).length };
    }

    // ── Quotes ────────────────────────────────────────────────────────────────
    case "create_quote": {
      const { data: biz } = await tbl("businesses")
        .select("quote_prefix, quote_next_number")
        .eq("id", ctx.businessId)
        .single();
      const number = `${biz?.quote_prefix ?? "QUO"}-${String(biz?.quote_next_number ?? 1).padStart(4, "0")}`;
      await tbl("businesses").update({ quote_next_number: (biz?.quote_next_number ?? 1) + 1 }).eq("id", ctx.businessId);

      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await tbl("quotes")
        .insert({
          customer_id: input.customer_id,
          status: "draft",
          issue_date: today,
          expiry_date: addDays(input.expiry_days ?? 30),
          line_items: lineItems,
          subtotal,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,
          tax_total: taxTotal,
          total,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          invoice_id: null,
          number,
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, number, total")
        .single();
      if (error) throw new Error(`Failed to create quote: ${error.message}`);
      return { id: data.id, number: data.number, total, message: `Quote ${data.number} created — $${total.toFixed(2)} total` };
    }

    case "list_quotes": {
      let q = tbl("quotes")
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
      const { data: quote } = await tbl("quotes")
        .select("*, customers(*)")
        .eq("id", input.quote_id)
        .eq("business_id", ctx.businessId)
        .single();
      if (!quote) throw new Error("Quote not found");
      if (!quote.customers?.email) throw new Error("Customer has no email address");

      const { data: business } = await tbl("businesses").select("*").eq("id", ctx.businessId).single();

      const { sendEmail } = await import("@/lib/email");
      const { quoteEmailHtml } = await import("@/lib/emails/quote");

      await sendEmail({
        to: quote.customers.email,
        subject: `Quote ${quote.number} from ${business.name}`,
        html: quoteEmailHtml({ quote, customer: quote.customers, business, lineItems: quote.line_items ?? [] }),
      });

      if (quote.status === "draft") {
        await tbl("quotes").update({ status: "sent" }).eq("id", input.quote_id);
      }

      return { message: `Quote ${quote.number} emailed to ${quote.customers.email}` };
    }

    case "convert_quote_to_invoice": {
      const { data: quote } = await tbl("quotes")
        .select("*")
        .eq("id", input.quote_id)
        .eq("business_id", ctx.businessId)
        .single();
      if (!quote) throw new Error("Quote not found");

      const { data: biz } = await tbl("businesses")
        .select("invoice_prefix, invoice_next_number")
        .eq("id", ctx.businessId)
        .single();
      const number = `${biz?.invoice_prefix ?? "INV"}-${String(biz?.invoice_next_number ?? 1).padStart(4, "0")}`;
      await tbl("businesses").update({ invoice_next_number: (biz?.invoice_next_number ?? 1) + 1 }).eq("id", ctx.businessId);

      const today = new Date().toISOString().split("T")[0];
      const { data: invoice, error } = await tbl("invoices")
        .insert({
          customer_id: quote.customer_id,
          status: "draft",
          issue_date: today,
          due_date: addDays(30),
          line_items: quote.line_items,
          subtotal: quote.subtotal,
          discount_type: quote.discount_type,
          discount_value: quote.discount_value,
          discount_amount: quote.discount_amount,
          tax_total: quote.tax_total,
          total: quote.total,
          amount_paid: 0,
          notes: quote.notes,
          terms: quote.terms,
          number,
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, number")
        .single();
      if (error) throw new Error(`Failed to create invoice: ${error.message}`);

      await tbl("quotes").update({ status: "accepted", invoice_id: invoice.id }).eq("id", input.quote_id);

      return { id: invoice.id, number: invoice.number, message: `Invoice ${invoice.number} created from quote ${quote.number}` };
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    case "create_invoice": {
      const { data: biz } = await tbl("businesses")
        .select("invoice_prefix, invoice_next_number")
        .eq("id", ctx.businessId)
        .single();
      const number = `${biz?.invoice_prefix ?? "INV"}-${String(biz?.invoice_next_number ?? 1).padStart(4, "0")}`;
      await tbl("businesses").update({ invoice_next_number: (biz?.invoice_next_number ?? 1) + 1 }).eq("id", ctx.businessId);

      const lineItems = buildLineItems(input.line_items);
      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.tax_amount, 0);
      const total = subtotal + taxTotal;
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await tbl("invoices")
        .insert({
          customer_id: input.customer_id,
          status: "draft",
          issue_date: today,
          due_date: addDays(input.due_days ?? 30),
          line_items: lineItems,
          subtotal,
          discount_type: null,
          discount_value: 0,
          discount_amount: 0,
          tax_total: taxTotal,
          total,
          amount_paid: 0,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          number,
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, number, total")
        .single();
      if (error) throw new Error(`Failed to create invoice: ${error.message}`);
      return { id: data.id, number: data.number, total, message: `Invoice ${data.number} created — $${total.toFixed(2)} total` };
    }

    case "list_invoices": {
      let q = tbl("invoices")
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
      const { data: invoice } = await tbl("invoices")
        .select("*, customers(*)")
        .eq("id", input.invoice_id)
        .eq("business_id", ctx.businessId)
        .single();
      if (!invoice) throw new Error("Invoice not found");
      if (!invoice.customers?.email) throw new Error("Customer has no email address");

      const { data: business } = await tbl("businesses").select("*").eq("id", ctx.businessId).single();

      const React = (await import("react")).default;
      const { renderToStream } = await import("@react-pdf/renderer");
      const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");

      const element = React.createElement(InvoicePDFDocument, { invoice, customer: invoice.customers, business, lineItems: invoice.line_items ?? [] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await renderToStream(element as any);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const pdfBuffer = Buffer.concat(chunks);

      const { sendEmail } = await import("@/lib/email");
      const { invoiceEmailHtml } = await import("@/lib/emails/invoice");
      await sendEmail({
        to: invoice.customers.email,
        subject: `Invoice ${invoice.number} from ${business.name}`,
        html: invoiceEmailHtml({ invoice, customer: invoice.customers, business, lineItems: invoice.line_items ?? [] }),
        attachments: [{ filename: `${invoice.number}.pdf`, content: pdfBuffer }],
      });

      if (invoice.status === "draft") {
        await tbl("invoices").update({ status: "sent" }).eq("id", input.invoice_id);
      }

      return { message: `Invoice ${invoice.number} emailed to ${invoice.customers.email}` };
    }

    case "record_payment": {
      const { data: invoice } = await tbl("invoices")
        .select("total, amount_paid")
        .eq("id", input.invoice_id)
        .eq("business_id", ctx.businessId)
        .single();
      if (!invoice) throw new Error("Invoice not found");

      await tbl("payments").insert({
        invoice_id: input.invoice_id,
        amount: input.amount,
        date: input.date ?? new Date().toISOString().split("T")[0],
        method: input.method ?? null,
        reference: input.reference ?? null,
        business_id: ctx.businessId,
        user_id: ctx.userId,
      });

      const newPaid = (invoice.amount_paid ?? 0) + input.amount;
      const newStatus = newPaid >= invoice.total ? "paid" : "partial";
      await tbl("invoices").update({ amount_paid: newPaid, status: newStatus }).eq("id", input.invoice_id);

      return { message: `Payment of $${input.amount} recorded. Invoice is now ${newStatus}.` };
    }

    // ── Reports ───────────────────────────────────────────────────────────────
    case "create_report": {
      const { data, error } = await tbl("reports")
        .insert({
          title: input.title,
          customer_id: input.customer_id ?? null,
          property_address: input.property_address ?? null,
          inspection_date: input.inspection_date ?? new Date().toISOString().split("T")[0],
          status: "draft",
          meta: { roof_type: input.roof_type ?? "", inspector_name: "" },
          business_id: ctx.businessId,
          user_id: ctx.userId,
        })
        .select("id, title")
        .single();
      if (error) throw new Error(`Failed to create report: ${error.message}`);
      return { id: data.id, title: data.title, message: `Inspection report "${data.title}" created as draft` };
    }

    case "list_reports": {
      let q = tbl("reports")
        .select("id, title, status, property_address, inspection_date, customers(name)")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 10);
      if (input.customer_id) q = q.eq("customer_id", input.customer_id);
      const { data } = await q;
      return { reports: data ?? [], count: (data ?? []).length };
    }

    // ── Schedule ──────────────────────────────────────────────────────────────
    case "get_schedule": {
      const end = input.end_date ?? input.start_date;
      const { data } = await tbl("work_orders")
        .select(`id, number, title, status, scheduled_date, start_time, end_time, property_address,
          customers(name, phone),
          work_order_assignments(member_profiles(name))`)
        .eq("business_id", ctx.businessId)
        .gte("scheduled_date", input.start_date)
        .lte("scheduled_date", end)
        .not("status", "eq", "cancelled")
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false });
      return { jobs: data ?? [], count: (data ?? []).length };
    }

    case "assign_job_workers": {
      // Delete existing assignments
      await tbl("work_order_assignments")
        .delete()
        .eq("work_order_id", input.work_order_id)
        .eq("business_id", ctx.businessId);
      // Insert new
      if (input.member_profile_ids?.length > 0) {
        await tbl("work_order_assignments").insert(
          input.member_profile_ids.map((pid: string) => ({
            work_order_id: input.work_order_id,
            business_id: ctx.businessId,
            member_profile_id: pid,
            assigned_by: ctx.userId,
          }))
        );
        // Update legacy single-assign fields
        const { data: first } = await tbl("member_profiles")
          .select("name, email, user_id")
          .eq("id", input.member_profile_ids[0])
          .single();
        if (first) {
          await tbl("work_orders").update({
            assigned_to: first.user_id ?? null,
            assigned_to_email: first.email ?? null,
            assigned_to_profile_id: input.member_profile_ids[0],
            status: "assigned",
          }).eq("id", input.work_order_id).eq("business_id", ctx.businessId);
        }
      }
      return { message: `${input.member_profile_ids.length} worker(s) assigned to job` };
    }

    case "list_team_profiles": {
      const { data } = await tbl("member_profiles")
        .select("id, name, email, phone, role_title, is_active")
        .eq("business_id", ctx.businessId)
        .eq("is_active", true)
        .order("name");
      return { profiles: data ?? [], count: (data ?? []).length };
    }

    // ── Leads ─────────────────────────────────────────────────────────────────
    case "list_leads": {
      let q = tbl("leads")
        .select("id, name, phone, email, suburb, service, status, source, created_at")
        .eq("business_id", ctx.businessId)
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 15);
      if (input.status) q = q.eq("status", input.status);
      const { data } = await q;
      return { leads: data ?? [], count: (data ?? []).length };
    }

    case "update_lead_status": {
      const { error } = await tbl("leads")
        .update({ status: input.status })
        .eq("id", input.lead_id)
        .eq("business_id", ctx.businessId);
      if (error) throw new Error(`Failed to update lead: ${error.message}`);
      return { message: `Lead moved to "${input.status}"` };
    }

    case "update_lead": {
      const { lead_id, ...updates } = input;
      const { error } = await tbl("leads")
        .update(updates)
        .eq("id", lead_id)
        .eq("business_id", ctx.businessId);
      if (error) throw new Error(`Failed to update lead: ${error.message}`);
      return { message: "Lead updated" };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 1. API key check
  if (!checkApiKey(req)) {
    return err("Unauthorized", 401);
  }

  // 2. Rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return new NextResponse(JSON.stringify({ error: "Too many requests. Try again in 5 minutes." }), {
      status: 429,
      headers: { "Retry-After": "300", "X-RateLimit-Remaining": "0" },
    });
  }

  // 3. Parse + validate body
  let body: { message?: unknown; caller?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const message = body.message;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return err("message is required and must be a non-empty string", 400);
  }
  if (message.length > 2000) {
    return err("message must be 2000 characters or less", 400);
  }

  const caller = typeof body.caller === "string" ? body.caller : "external";

  // 4. Load business context — scoped to Crown Roofers only
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: business, error: bizError } = await (sb as any)
    .from("businesses")
    .select("id, name, user_id")
    .eq("id", AGENT_BUSINESS_ID)
    .single();

  if (bizError || !business) {
    console.error("Failed to load business:", bizError);
    return err("Service unavailable", 503);
  }

  const ctx: BizContext = {
    businessId: AGENT_BUSINESS_ID,
    userId: AGENT_USER_ID,
    businessName: business.name,
  };

  // 5. Run agent loop
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are the AI assistant for ${ctx.businessName}, a roofing business in Sydney.
You are being called by: ${caller}.
Today's date: ${today}

You have full access to the business system — schedule, leads, customers, quotes, invoices, work orders, and inspection reports.

RULES:
1. Always search for an existing customer before creating one.
2. For quotes/invoices, search the product catalog first for stored prices.
3. After creating any record, state its number (e.g. QT-0004).
4. Be concise — you are replying in a messaging app, not a web interface.
5. Use plain text only, no markdown.
6. Keep replies under 150 words unless listing multiple items.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message.trim() }];

  try {
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      // If no tool calls, we have the final answer
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (toolUses.length === 0) {
        const text = response.content.find((b) => b.type === "text");
        const reply = text?.type === "text" ? text.text : "Done.";
        return NextResponse.json(
          { reply, caller },
          { headers: { "X-RateLimit-Remaining": String(remaining) } }
        );
      }

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUses) {
        if (block.type !== "tool_use") continue;
        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>, ctx);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Tool failed";
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ reply: "Request took too many steps. Please try a simpler request." });
  } catch (e) {
    console.error("Agent error:", e);
    return err("Something went wrong processing your request", 500);
  }
}
