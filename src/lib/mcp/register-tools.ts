/**
 * Registers every Kirei MCP tool on the given server.
 *
 * Each tool:
 *   - reads the business context from the authenticated API key
 *     (extra.authInfo.extra, set by the auth wrapper in the route)
 *   - checks the required scope
 *   - runs against the admin Supabase client scoped by business_id
 *
 * Heavy operations (quote/invoice PDF + email) reuse the same pure helpers
 * the cookie-bound server actions use, so output is identical to the web app.
 */

import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";
import { assertScope, t, text, errorText, type McpContext } from "./context";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { invoiceEmailHtml, invoiceEmailSubject } from "@/lib/emails/invoice";
import { quoteEmailHtml, quoteEmailSubject } from "@/lib/emails/quote";
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_VARIABLES,
  resolveEmailTemplate,
  type EmailTemplateType,
} from "@/lib/emails/templates";
import { customerAllowsCard } from "@/lib/payment-methods";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/documents/template-config";
import { createRevolutOrder, toRevolutAmount, type RevolutMode } from "@/lib/revolut";
import { decryptSecret } from "@/lib/crypto";
import { presetByKey, TEMPLATE_PRESETS } from "@/lib/documents/presets";
import type { LineItem } from "@/types/database";
import { ctxFrom, appBase, UUID, getOrMintPortalToken, type ToolFn } from "./tools/shared";
import { registerPluginFormTools, registerLeadFormTools } from "./tools/plugin-form-tools";
import { registerSeoTools } from "./tools/seo-tools";
import { registerContentTools } from "./tools/content-tools";
import { registerExpenseTools, registerRecurringExpenseTools } from "./tools/expenses-tools";
import { registerMaterialTools } from "./tools/materials-tools";
import { registerInventoryTools } from "./tools/inventory-tools";
import { registerTimesheetTools } from "./tools/timesheets-tools";
import { registerAssetTools } from "./tools/assets-tools";
import { registerProspectTools } from "./tools/prospects-tools";
import { registerVaultTools } from "./tools/vault-tools";
import { registerOutreachTools } from "./tools/outreach-tools";
import { registerTelephonyTools } from "./tools/telephony-tools";
import { registerAssistantTools } from "./tools/assistant-tools";
import { ilikeAcross } from "@/lib/pg-filter";

// ── helpers ────────────────────────────────────────────────────────────────

/** Extract a human message from anything thrown — Error, Supabase
 *  PostgrestError (plain object with .message/.details/.hint/.code), or
 *  arbitrary value. Avoids the "[object Object]" that plain String() gives. */
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = e as any;
    const parts = [o.message, o.details, o.hint, o.code && `(${o.code})`].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    try { return JSON.stringify(e); } catch { return "Unknown error"; }
  }
  return String(e);
}

/** Mint the next sequential document number for an entity straight from the
 *  businesses counter (e.g. quote_prefix + quote_next_number -> QT-0007),
 *  bumping the counter. We do NOT use the next_quote_number / next_invoice_number
 *  RPCs here: they are SECURITY DEFINER but gate on auth.uid() membership, which
 *  is NULL under the service-role MCP client, so they raise "Not authorised".
 *  This read-bump matches what the cookie-bound server actions fall back to. */
async function mintNumber(ctx: McpContext, prefixCol: string, counterCol: string, fallbackPrefix: string): Promise<string> {
  const { data: biz, error } = await t(ctx, "businesses").select(`${prefixCol}, ${counterCol}`).eq("id", ctx.businessId).single();
  if (error) throw error;
  const next = biz?.[counterCol] ?? 1;
  const number = `${biz?.[prefixCol] ?? fallbackPrefix}-${String(next).padStart(4, "0")}`;
  const { error: upErr } = await t(ctx, "businesses").update({ [counterCol]: next + 1 }).eq("id", ctx.businessId);
  if (upErr) throw upErr;
  return number;
}

/** Compute line-item math from a sparse spec. Mirrors the web editor. */
function buildLineItems(
  raw: Array<{ name: string; description?: string; quantity?: number; unit_price: number; tax_rate?: number; discount_percent?: number }>,
  defaultTaxRate = 10,
): { items: LineItem[]; subtotal: number; tax_total: number; total: number } {
  const items = raw.map((it) => {
    const quantity = it.quantity ?? 1;
    const unit_price = it.unit_price;
    const tax_rate = it.tax_rate ?? defaultTaxRate;
    const discount_percent = it.discount_percent ?? 0;
    const gross = quantity * unit_price;
    const subtotal = gross * (1 - discount_percent / 100);
    const tax_amount = (subtotal * tax_rate) / 100;
    return {
      id: uuidv4(),
      name: it.name,
      description: it.description ?? "",
      quantity, unit_price, tax_rate, discount_percent,
      subtotal, tax_amount, total: subtotal + tax_amount,
    } satisfies LineItem;
  });
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const tax_total = items.reduce((s, i) => s + i.tax_amount, 0);
  return { items, subtotal, tax_total, total: subtotal + tax_total };
}

async function getBusiness(ctx: McpContext) {
  const { data } = await t(ctx, "businesses").select("*").eq("id", ctx.businessId).single();
  return data;
}

async function renderPdf(kind: "quote" | "invoice", doc: unknown, customer: unknown, business: unknown, lineItems: LineItem[]): Promise<Buffer> {
  const { renderToStream } = await import("@react-pdf/renderer");
  const React = await import("react");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let element: any;
  if (kind === "quote") {
    const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
    element = React.createElement(QuotePDFDocument, { quote: doc, customer, business, lineItems } as never);
  } else {
    const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
    element = React.createElement(InvoicePDFDocument, { invoice: doc, customer, business, lineItems } as never);
  }
  const stream = await renderToStream(element);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ── registration ─────────────────────────────────────────────────────────────

/**
 * Register every Kirei tool against `register`.
 *
 * Takes a `ToolFn` rather than an MCP server so the same definitions can back
 * more than one surface: `/api/mcp` passes an adapter onto the real server,
 * while `collect.ts` passes a collector that just gathers the specs (which is
 * how the in-app assistant gets the identical tool set instead of maintaining
 * its own copy). The sub-registrars below already took a `ToolFn`; this makes
 * the top-level match them.
 */
export function registerTools(register: ToolFn): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = (name: string, description: string, shape: z.ZodRawShape, handler: (args: any, extra: any) => Promise<unknown>) =>
    register(name, description, shape, async (args: unknown, extra: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await handler(args as any, extra as any);
      } catch (e) {
        return errorText(errMsg(e));
      }
    });

  // ===== CUSTOMERS =====
  tool("list_customers", "List customers for the business. Optionally filter by a search term against name/email/company.",
    { search: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      let q = t(ctx, "customers").select("id, name, company, email, phone, address, city, postcode, archived")
        .eq("business_id", ctx.businessId).order("name").limit(args.limit ?? 50);
      if (args.search) q = q.or(ilikeAcross(["name", "email", "company"], args.search));
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_customer", "Get one customer with their invoices, quotes and work orders.",
    { customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      const { data: customer } = await t(ctx, "customers").select("*").eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!customer) return errorText("Customer not found");
      const [{ data: invoices }, { data: quotes }, { data: workOrders }] = await Promise.all([
        t(ctx, "invoices").select("id, number, status, total, amount_paid, issue_date").eq("customer_id", args.customer_id).eq("business_id", ctx.businessId),
        t(ctx, "quotes").select("id, number, status, total, issue_date").eq("customer_id", args.customer_id).eq("business_id", ctx.businessId),
        t(ctx, "work_orders").select("id, number, title, status, scheduled_date").eq("customer_id", args.customer_id).eq("business_id", ctx.businessId),
      ]);
      return text({ customer, invoices, quotes, workOrders });
    });

  tool("create_customer", "Create a new customer.",
    {
      name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(),
      company: z.string().optional(), address: z.string().optional(), city: z.string().optional(),
      postcode: z.string().optional(), notes: z.string().optional(),
      allowed_payment_methods: z.array(z.enum(["card", "bank_transfer", "cash"])).optional()
        .describe("Restrict which methods this customer may pay with. Omit/empty = offer all the business supports."),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { data, error } = await t(ctx, "customers").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name, email: args.email ?? null, phone: args.phone ?? null,
        company: args.company ?? null, address: args.address ?? null, city: args.city ?? null,
        postcode: args.postcode ?? null, notes: args.notes ?? null, archived: false,
        allowed_payment_methods: args.allowed_payment_methods?.length ? args.allowed_payment_methods : null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, customer: data });
    });

  tool("update_customer", "Update fields on a customer. Only provided fields change.",
    {
      customer_id: UUID, name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      company: z.string().optional(), address: z.string().optional(), city: z.string().optional(),
      postcode: z.string().optional(), notes: z.string().optional(), archived: z.boolean().optional(),
      allowed_payment_methods: z.array(z.enum(["card", "bank_transfer", "cash"])).nullable().optional()
        .describe("Restrict which methods this customer may pay with. null/empty = offer all the business supports."),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { customer_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const { data, error } = await t(ctx, "customers").update(clean).eq("id", customer_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, customer: data });
    });

  // ===== QUOTES =====
  tool("list_quotes", "List quotes. Optionally filter by status (draft/sent/accepted/rejected/expired).",
    { status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:read");
      let q = t(ctx, "quotes").select("id, number, status, total, issue_date, expiry_date, customer_id, customers(name)")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(args.limit ?? 50);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_quote", "Get a full quote including line items.",
    { quote_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:read");
      const { data } = await t(ctx, "quotes").select("*, customers(name, email)").eq("id", args.quote_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Quote not found");
      return text(data);
    });

  tool("create_quote", "Create a quote for a customer with line items. Tax defaults to 10% per item unless given.",
    {
      customer_id: UUID,
      line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).min(1),
      expiry_days: z.number().int().optional(),
      notes: z.string().optional(), terms: z.string().optional(), property_address: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write");
      const { items, subtotal, tax_total, total } = buildLineItems(args.line_items);
      const number = await mintNumber(ctx, "quote_prefix", "quote_next_number", "QT");
      const issue = new Date().toISOString().split("T")[0];
      const expiry = new Date(Date.now() + (args.expiry_days ?? 30) * 86_400_000).toISOString().split("T")[0];
      const { data, error } = await t(ctx, "quotes").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: args.customer_id, number,
        issue_date: issue, expiry_date: expiry, line_items: items,
        subtotal, discount_type: "fixed", discount_value: 0, discount_amount: 0, tax_total, total,
        notes: args.notes ?? null, terms: args.terms ?? null, property_address: args.property_address ?? null,
        status: "draft", invoice_id: null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, quote: data });
    });

  tool("send_quote_email", "Email a quote to the customer (or given recipients) with the PDF attached and a portal accept link.",
    { quote_id: UUID, recipients: z.array(z.string().email()).optional(), subject: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write"); assertScope(ctx, "email:send");
      const { data: quote } = await t(ctx, "quotes").select("*, customers(*)").eq("id", args.quote_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!quote) return errorText("Quote not found");
      const business = await getBusiness(ctx);
      const customer = quote.customers;
      const recipients = (args.recipients ?? (customer?.email ? [customer.email] : [])).map((e: string) => e.trim()).filter(Boolean);
      if (recipients.length === 0) return errorText("No recipient email — pass recipients or set the customer's email.");
      const lineItems = (quote.line_items ?? []) as LineItem[];
      const pdf = await renderPdf("quote", quote, customer, business, lineItems);
      let acceptUrl: string | null = null, pdfUrl: string | null = null;
      if (customer?.id) {
        const token = await getOrMintPortalToken(ctx, customer.id);
        acceptUrl = `${appBase()}/portal/${token}/quote/${quote.id}`;
        pdfUrl = `${appBase()}/api/pdf/quote/${quote.id}?token=${token}`;
      }
      const { data: quoteTplRow } = await t(ctx, "email_templates").select("*").eq("business_id", ctx.businessId).eq("template_type", "quote").maybeSingle();
      const quoteTemplate = resolveEmailTemplate("quote", quoteTplRow);
      await sendEmail({
        to: recipients,
        subject: args.subject ?? quoteEmailSubject({ quote, customer, business }, quoteTemplate),
        html: quoteEmailHtml({ quote, customer, business, lineItems, acceptUrl, pdfUrl, template: quoteTemplate }),
        attachments: [{ filename: `${quote.number}.pdf`, content: pdf }],
        from: business?.name ? buildBusinessFrom({ name: business.name, localPart: "quotes" }) : undefined,
        replyTo: business?.email || undefined,
        tags: { business_id: ctx.businessId, doc_type: "quote", doc_id: quote.id },
      });
      if (quote.status === "draft") await t(ctx, "quotes").update({ status: "sent" }).eq("id", quote.id);
      return text({ sent: true, to: recipients });
    });

  // ===== INVOICES =====
  tool("list_invoices", "List invoices. Optionally filter by status (draft/sent/partial/paid/overdue/cancelled).",
    { status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:read");
      let q = t(ctx, "invoices").select("id, number, status, total, amount_paid, issue_date, due_date, customer_id, customers(name)")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(args.limit ?? 50);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_invoice", "Get a full invoice including line items.",
    { invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:read");
      const { data } = await t(ctx, "invoices").select("*, customers(name, email)").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Invoice not found");
      return text(data);
    });

  tool("create_invoice", "Create an invoice for a customer with line items.",
    {
      customer_id: UUID,
      line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).min(1),
      due_days: z.number().int().optional(),
      notes: z.string().optional(), terms: z.string().optional(), property_address: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { items, subtotal, tax_total, total } = buildLineItems(args.line_items);
      const number = await mintNumber(ctx, "invoice_prefix", "invoice_next_number", "INV");
      const issue = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + (args.due_days ?? 14) * 86_400_000).toISOString().split("T")[0];
      const { data, error } = await t(ctx, "invoices").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: args.customer_id, number,
        issue_date: issue, due_date: due, line_items: items,
        subtotal, discount_type: "fixed", discount_value: 0, discount_amount: 0, tax_total, total,
        amount_paid: 0, notes: args.notes ?? null, terms: args.terms ?? null,
        property_address: args.property_address ?? null, status: "draft",
      }).select().single();
      if (error) throw error;
      return text({ created: true, invoice: data });
    });

  tool("send_invoice_email", "Email an invoice to the customer with the PDF attached and a pay-online portal link.",
    { invoice_id: UUID, recipients: z.array(z.string().email()).optional(), subject: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write"); assertScope(ctx, "email:send");
      const { data: invoice } = await t(ctx, "invoices").select("*, customers(*)").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!invoice) return errorText("Invoice not found");
      const business = await getBusiness(ctx);
      const customer = invoice.customers;
      const recipients = (args.recipients ?? (customer?.email ? [customer.email] : [])).map((e: string) => e.trim()).filter(Boolean);
      if (recipients.length === 0) return errorText("No recipient email — pass recipients or set the customer's email.");
      const lineItems = (invoice.line_items ?? []) as LineItem[];
      const pdf = await renderPdf("invoice", invoice, customer, business, lineItems);
      let portalUrl: string | null = null, pdfUrl: string | null = null, payUrl: string | null = null;
      if (customer?.id) {
        const token = await getOrMintPortalToken(ctx, customer.id);
        portalUrl = `${appBase()}/portal/${token}/invoice/${invoice.id}`;
        pdfUrl = `${appBase()}/api/pdf/invoice/${invoice.id}?token=${token}`;
        const balance = Number(invoice.total) - Number(invoice.amount_paid ?? 0);
        if (business?.stripe_charges_enabled && balance > 0.01 && customerAllowsCard(customer?.allowed_payment_methods)) {
          payUrl = `${appBase()}/api/stripe/checkout?invoice=${invoice.id}&token=${token}`;
        }
      }
      const { data: invTplRow } = await t(ctx, "email_templates").select("*").eq("business_id", ctx.businessId).eq("template_type", "invoice").maybeSingle();
      const invoiceTemplate = resolveEmailTemplate("invoice", invTplRow);
      await sendEmail({
        to: recipients,
        subject: args.subject ?? invoiceEmailSubject({ invoice, customer, business }, invoiceTemplate),
        html: invoiceEmailHtml({ invoice, customer, business, lineItems, portalUrl, pdfUrl, payUrl, template: invoiceTemplate }),
        attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
        from: business?.name ? buildBusinessFrom({ name: business.name, localPart: "invoices" }) : undefined,
        replyTo: business?.email || undefined,
        tags: { business_id: ctx.businessId, doc_type: "invoice", doc_id: invoice.id },
      });
      if (invoice.status === "draft") await t(ctx, "invoices").update({ status: "sent" }).eq("id", invoice.id);
      return text({ sent: true, to: recipients });
    });

  tool("mark_invoice_paid", "Mark an invoice as fully paid.",
    { invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: inv } = await t(ctx, "invoices").select("total").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!inv) return errorText("Invoice not found");
      const { error } = await t(ctx, "invoices").update({ status: "paid", amount_paid: inv.total }).eq("id", args.invoice_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  // ===== LEADS =====
  tool("list_leads", "List leads. Optionally filter by status (new/contacted/quoted/won/lost).",
    { status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:read");
      let q = t(ctx, "leads").select("id, name, phone, email, suburb, service, status, source, created_at")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(args.limit ?? 50);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_lead", "Create a lead.",
    {
      name: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
      suburb: z.string().optional(), service: z.string().optional(), source: z.string().optional(), notes: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      // upsert_lead handles dedup (it's the single ingest path). It's
      // SECURITY INVOKER and requires p_user_id — the service-role client
      // satisfies it.
      const { data, error } = await ctx.sb.rpc("upsert_lead", {
        p_business_id: ctx.businessId, p_user_id: ctx.userId, p_name: args.name,
        p_phone: args.phone ?? null, p_email: args.email ?? null,
        p_suburb: args.suburb ?? null, p_service: args.service ?? null,
        p_source: args.source ?? "manual", p_notes: args.notes ?? null,
      });
      if (error) {
        // Fall back to a plain insert (leads.user_id is NOT NULL).
        const { data: ins, error: insErr } = await t(ctx, "leads").insert({
          business_id: ctx.businessId, user_id: ctx.userId, name: args.name,
          phone: args.phone ?? null, email: args.email ?? null,
          suburb: args.suburb ?? null, service: args.service ?? null,
          source: args.source ?? "manual", notes: args.notes ?? null, status: "new",
        }).select().single();
        if (insErr) throw insErr;
        return text({ created: true, lead: ins });
      }
      return text({ created: true, lead: data });
    });

  tool("set_lead_status", "Update a lead's pipeline status (new/contacted/quoted/won/lost).",
    { lead_id: UUID, status: z.enum(["new", "contacted", "quoted", "won", "lost"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { error } = await t(ctx, "leads").update({ status: args.status }).eq("id", args.lead_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  // ===== WORK ORDERS =====
  tool("list_work_orders", "List work orders / jobs. Optionally filter by status.",
    { status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      let q = t(ctx, "work_orders").select("id, number, title, status, scheduled_date, property_address, customer_id, customers(name)")
        .eq("business_id", ctx.businessId).order("created_at", { ascending: false }).limit(args.limit ?? 50);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_work_order", "Create a work order / job.",
    {
      title: z.string().min(1), customer_id: UUID.optional(), property_address: z.string().optional(),
      scheduled_date: z.string().optional(), start_time: z.string().optional(), end_time: z.string().optional(),
      reported_issue: z.string().optional(), description: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      // Mint the WO number the same way the web app does: read the business
      // prefix + next number, then bump the counter. (There is no RPC for
      // this — the previous version called a non-existent RPC and inserted a
      // null number, which the NOT NULL column rejected.)
      const { data: biz } = await t(ctx, "businesses")
        .select("work_order_prefix, work_order_next_number")
        .eq("id", ctx.businessId).single();
      const next = biz?.work_order_next_number ?? 1;
      const number = `${biz?.work_order_prefix ?? "WO"}-${String(next).padStart(4, "0")}`;
      await t(ctx, "businesses").update({ work_order_next_number: next + 1 }).eq("id", ctx.businessId);

      const { data, error } = await t(ctx, "work_orders").insert({
        business_id: ctx.businessId, user_id: ctx.userId, number, title: args.title,
        customer_id: args.customer_id ?? null, property_address: args.property_address ?? null,
        scheduled_date: args.scheduled_date ?? null,
        start_time: args.start_time ?? null, end_time: args.end_time ?? null,
        reported_issue: args.reported_issue ?? null,
        description: args.description ?? null, status: "draft", photos: [],
      }).select().single();
      if (error) throw error;
      return text({ created: true, work_order: data });
    });

  // ===== TASKS =====
  tool("list_tasks", "List tasks on the team kanban. Optionally filter by status (todo/in_progress/in_review/done).",
    { status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "tasks:read");
      let q = t(ctx, "tasks").select("id, title, description, status, priority, due_date, tags")
        .eq("business_id", ctx.businessId).order("position").limit(args.limit ?? 100);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_task", "Create a task on the kanban.",
    {
      title: z.string().min(1), description: z.string().optional(),
      status: z.enum(["todo", "in_progress", "in_review", "done"]).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      due_date: z.string().optional(), tags: z.array(z.string()).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "tasks:write");
      const status = args.status ?? "todo";
      const { data: maxRow } = await t(ctx, "tasks").select("position").eq("business_id", ctx.businessId).eq("status", status).order("position", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await t(ctx, "tasks").insert({
        business_id: ctx.businessId, created_by: ctx.userId,
        title: args.title, description: args.description ?? null,
        status, priority: args.priority ?? "normal", due_date: args.due_date ?? null,
        tags: args.tags ?? [], position: (maxRow?.position ?? -1) + 1,
      }).select().single();
      if (error) throw error;
      return text({ created: true, task: data });
    });

  tool("update_task_status", "Move a task to a new status.",
    { task_id: UUID, status: z.enum(["todo", "in_progress", "in_review", "done"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "tasks:write");
      const { error } = await t(ctx, "tasks").update({ status: args.status }).eq("id", args.task_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  // ===== PRODUCTS =====
  tool("list_products", "List products / services in the catalog.",
    { search: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:read");
      let q = t(ctx, "products").select("id, name, description, unit_price, tax_rate, unit, archived")
        .eq("business_id", ctx.businessId).order("name").limit(args.limit ?? 100);
      if (args.search) q = q.ilike("name", `%${args.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_product", "Add a product / service to the catalog.",
    { name: z.string().min(1), unit_price: z.number(), tax_rate: z.number().optional(), description: z.string().optional(), unit: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      const { data, error } = await t(ctx, "products").insert({
        business_id: ctx.businessId, user_id: ctx.userId, name: args.name, unit_price: args.unit_price,
        tax_rate: args.tax_rate ?? 10, description: args.description ?? null, unit: args.unit ?? null, archived: false,
      }).select().single();
      if (error) throw error;
      return text({ created: true, product: data });
    });

  // ===== SETTINGS =====
  tool("get_settings", "Get the business profile + settings (name, contact, currency, prefixes, bank, appearance).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { data } = await t(ctx, "businesses").select("*").eq("id", ctx.businessId).single();
      return text(data);
    });

  // Navigation — what the sidebar is called, in what order, what's hidden.
  // Renaming is the point of it: an agency asks for "Projects", not "Work
  // Orders", and the assistant can now do that in one instruction.
  // Leads and clients are the same people at different stages: a lead gets a
  // contact row the first time you bill them, and becomes a client when they
  // pay. These expose that without a second document owner type.
  tool("prepare_lead_for_billing",
    "Get (creating if needed) the contact record to raise a quote or invoice against for a lead. The lead stays a lead — they become a client only when a payment arrives. Returns customer_id to pass to create_quote / create_invoice.",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { ensureContactForLead } = await import("@/lib/leads/promote");
      // ctx.sb IS the admin client (see lib/mcp/context.ts); promote.ts takes
      // a client rather than making one precisely so it works from here.
      const res = await ensureContactForLead(ctx.sb, ctx.businessId, args.lead_id);
      return text({ ok: true, ...res });
    });

  tool("get_lead_billing",
    "Quotes and invoices raised against a lead, and whether they have become a paying client.",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:read");
      const { data: lead } = await t(ctx, "leads")
        .select("customer_id").eq("id", args.lead_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!lead?.customer_id) return text({ customer_id: null, quotes: [], invoices: [], is_client: false });
      const [{ data: quotes }, { data: invoices }, { data: contact }] = await Promise.all([
        t(ctx, "quotes").select("id, number, status, total").eq("business_id", ctx.businessId).eq("customer_id", lead.customer_id).limit(50),
        t(ctx, "invoices").select("id, number, status, total, amount_paid").eq("business_id", ctx.businessId).eq("customer_id", lead.customer_id).limit(50),
        t(ctx, "customers").select("lifecycle_stage").eq("id", lead.customer_id).eq("business_id", ctx.businessId).maybeSingle(),
      ]);
      return text({
        customer_id: lead.customer_id, quotes: quotes ?? [], invoices: invoices ?? [],
        is_client: contact?.lifecycle_stage === "client",
      });
    });

  tool("list_client_accounts",
    "Every business this key can reach, with outstanding, overdue and jobs booked today for each — the agency console as data. Use to answer 'which of my clients needs me today'.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      // NOTE: an API key is scoped to ONE business by design, so this returns
      // that business only. The cross-account view is a signed-in surface —
      // widening a key to span businesses would turn one leaked key into a
      // breach of every client the agency holds.
      const { data: biz } = await t(ctx, "businesses")
        .select("id, name, currency, industry_preset").eq("id", ctx.businessId).single();
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: invoices }, { data: jobs }] = await Promise.all([
        t(ctx, "invoices").select("status, total, amount_paid, due_date")
          .eq("business_id", ctx.businessId).neq("status", "draft").limit(5000),
        t(ctx, "work_orders").select("id")
          .eq("business_id", ctx.businessId).eq("scheduled_date", today).limit(2000),
      ]);
      const num = (v: unknown) => Number(v ?? 0) || 0;
      let outstanding = 0, overdue = 0, overdueCount = 0;
      for (const inv of (invoices ?? []) as Array<Record<string, unknown>>) {
        const due = num(inv.total) - num(inv.amount_paid);
        if (String(inv.status) === "paid" || due <= 0) continue;
        outstanding += due;
        if (String(inv.status) === "overdue" || (typeof inv.due_date === "string" && inv.due_date < today)) {
          overdue += due; overdueCount += 1;
        }
      }
      return text([{
        id: biz?.id, name: biz?.name, currency: biz?.currency ?? "GBP",
        outstanding, overdue, overdue_count: overdueCount,
        jobs_today: (jobs ?? []).length,
      }]);
    });

  tool("get_navigation", "Get the business's sidebar navigation overrides: {labels: {href: name}, hidden: [href], order: [href]}. NULL/empty means it follows the industry preset.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { data } = await t(ctx, "businesses").select("nav_config, industry_preset").eq("id", ctx.businessId).single();
      return text(data);
    });

  tool("update_navigation", "Rename, reorder or hide sidebar items. Keys are page paths ('/work-orders', '/quotes', '/customers'). Only the provided parts change — pass an empty object/array for a part to clear it back to the industry preset. Hiding removes an item from the sidebar; it does NOT disable the feature (use set_plugin_enabled for that).",
    {
      labels: z.record(z.string(), z.string()).optional().describe('Page path → name, e.g. {"/work-orders": "Projects"}'),
      hidden: z.array(z.string()).optional().describe("Page paths to hide from the sidebar"),
      order: z.array(z.string()).optional().describe("Page paths in display order; anything omitted keeps its default position"),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { data: row } = await t(ctx, "businesses").select("nav_config").eq("id", ctx.businessId).single();
      const prev = (row?.nav_config ?? {}) as Record<string, unknown>;
      // Merge, so renaming one item doesn't silently drop the hide/order the
      // user set in Settings.
      const next: Record<string, unknown> = { ...prev };
      if (args.labels !== undefined) next.labels = { ...(prev.labels as object ?? {}), ...args.labels };
      if (args.hidden !== undefined) next.hidden = args.hidden;
      if (args.order !== undefined) next.order = args.order;
      for (const k of ["labels", "hidden", "order"]) {
        const v = next[k];
        if (!v || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0)) delete next[k];
      }
      const value = Object.keys(next).length ? next : null;
      const { error } = await t(ctx, "businesses").update({ nav_config: value }).eq("id", ctx.businessId);
      if (error) throw new Error(error.message);
      return text({ ok: true, nav_config: value });
    });

  tool("update_settings", "Update business settings / preferences. Only provided fields change. Common fields: name, email, phone, address, currency, accent_color, sidebar_theme, bg_pattern, invoice_prefix, quote_prefix, bank_name, bank_account_number, bank_account_name, bank_sort_code, license_number. Document defaults: default_notes, payment_terms, and the per-type default terms & conditions default_invoice_terms / default_quote_terms (pre-fill new invoices / quotes — same as the PDF template editor's 'Default terms & conditions').",
    {
      name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(),
      currency: z.string().optional(), accent_color: z.string().optional(), sidebar_theme: z.string().optional(),
      bg_pattern: z.string().optional(), invoice_prefix: z.string().optional(), quote_prefix: z.string().optional(),
      bank_name: z.string().optional(), bank_account_number: z.string().optional(), bank_account_name: z.string().optional(),
      bank_sort_code: z.string().optional(), license_number: z.string().optional(),
      // Document defaults pre-filled on new invoices/quotes.
      default_notes: z.string().nullable().optional(),
      payment_terms: z.string().nullable().optional(),
      default_invoice_terms: z.string().nullable().optional(),
      default_quote_terms: z.string().nullable().optional(),
      // Stripe / payments: platform fee % and the quote-accept deposit %.
      platform_fee_percent: z.number().min(0).max(30).nullable().optional(),
      deposit_percent: z.number().min(0).max(100).nullable().optional(),
      // Card surcharge passed to the customer (regulated — keep compliant).
      card_surcharge_enabled: z.boolean().optional(),
      card_surcharge_percent: z.number().min(0).max(30).optional(),
      card_surcharge_fixed: z.number().min(0).optional(),
      card_surcharge_note: z.string().nullable().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "businesses").update(clean).eq("id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, settings: data });
    });

  // ===== EMAIL TEMPLATES =====
  const EMAIL_TPL_TYPE = z.enum(EMAIL_TEMPLATE_TYPES as [EmailTemplateType, ...EmailTemplateType[]]);

  tool("list_email_templates", "List the business's email templates (invoice / quote / team_invite / work_order_submitted). Shows the resolved value of every field (override merged onto defaults), whether each type is customised, and the {{variables}} available per type.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { data: rows } = await t(ctx, "email_templates").select("*").eq("business_id", ctx.businessId);
      const result = EMAIL_TEMPLATE_TYPES.map((type) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = (rows ?? []).find((r: any) => r.template_type === type) ?? null;
        return {
          type,
          customised: !!row,
          resolved: resolveEmailTemplate(type, row),
          defaults: EMAIL_TEMPLATE_DEFAULTS[type],
          variables: EMAIL_TEMPLATE_VARIABLES[type],
        };
      });
      return text(result);
    });

  tool("update_email_template", "Customise an outbound email template for this business. Only provided fields change; text fields support {{variable}} placeholders (see list_email_templates for the variables per type). subject/greeting/intro/footer_note/accent_color set the standard layout; custom_html replaces the entire email body (the branded wrapper + subject still apply). Pass an empty string to reset a single field to its default.",
    {
      template_type: EMAIL_TPL_TYPE,
      subject: z.string().optional(),
      greeting: z.string().optional(),
      intro: z.string().optional(),
      footer_note: z.string().optional(),
      accent_color: z.string().optional(),
      show_line_items: z.boolean().optional(),
      show_payment_details: z.boolean().optional(),
      show_buttons: z.boolean().optional(),
      custom_html: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { template_type, ...fields } = args;
      // Empty string = "reset this field to default" (stored as NULL).
      const clean = Object.fromEntries(
        Object.entries(fields)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
      );
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "email_templates")
        .upsert({ business_id: ctx.businessId, template_type, ...clean }, { onConflict: "business_id,template_type" })
        .select().single();
      if (error) throw error;
      return text({ updated: true, resolved: resolveEmailTemplate(template_type, data) });
    });

  tool("reset_email_template", "Reset an email template back to the built-in default (deletes the business override).",
    { template_type: EMAIL_TPL_TYPE },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { error } = await t(ctx, "email_templates").delete().eq("business_id", ctx.businessId).eq("template_type", args.template_type);
      if (error) throw error;
      return text({ reset: true, defaults: EMAIL_TEMPLATE_DEFAULTS[args.template_type as EmailTemplateType] });
    });

  // ===== DOCUMENT TEMPLATES (invoice / quote PDF templates) =====
  const DOC_TPL_TYPE = z.enum(["invoice", "quote", "both"]);

  tool("list_document_templates", "List saved PDF templates for invoices/quotes (name, doc_type, is_default). Optionally filter by doc_type. Also returns the built-in starter presets you can create from.",
    { doc_type: z.enum(["invoice", "quote"]).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      let q = t(ctx, "document_templates").select("id, name, doc_type, is_default, source, preset_key, created_at").eq("business_id", ctx.businessId).order("created_at", { ascending: true });
      if (args.doc_type) q = q.in("doc_type", [args.doc_type, "both"]);
      const { data, error } = await q;
      if (error) throw error;
      return text({ templates: data ?? [], presets: TEMPLATE_PRESETS.map((p) => ({ key: p.key, name: p.name, description: p.description })) });
    });

  tool("get_document_template", "Get a document template's full config.",
    { id: z.string() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { data, error } = await t(ctx, "document_templates").select("*").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
      if (error) throw error;
      if (!data) return errorText("Template not found.");
      return text(data);
    });

  tool("create_document_template", "Create a saved PDF template. Start from a built-in preset (from_preset, see list_document_templates) and/or pass a partial config to override (palette, fonts, background_image_url, watermark_text, custom_fields, columns, section toggles, labels — see the TemplateConfig shape). Optionally make it the default for its doc_type.",
    {
      name: z.string(),
      doc_type: DOC_TPL_TYPE,
      from_preset: z.string().optional(),
      config: z.record(z.any()).optional(),
      make_default: z.boolean().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const name = args.name?.trim();
      if (!name) return errorText("name is required.");
      const preset = args.from_preset ? presetByKey(args.from_preset) : undefined;
      const config = { ...DEFAULT_TEMPLATE_CONFIG, ...(preset?.config ?? {}), ...(args.config ?? {}) };
      const { data, error } = await t(ctx, "document_templates").insert({
        business_id: ctx.businessId, name, doc_type: args.doc_type, config,
        source: preset ? "preset" : "user", preset_key: preset?.key ?? null, is_default: false,
      }).select().single();
      if (error) throw error;
      if (args.make_default) {
        const overlap = args.doc_type === "both" ? ["invoice", "quote", "both"] : [args.doc_type, "both"];
        await t(ctx, "document_templates").update({ is_default: false }).eq("business_id", ctx.businessId).in("doc_type", overlap);
        await t(ctx, "document_templates").update({ is_default: true }).eq("id", data.id).eq("business_id", ctx.businessId);
      }
      return text({ created: true, id: data.id });
    });

  tool("update_document_template", "Update a template's name, doc_type, and/or config. config is merged onto the stored config, so pass only the fields you want to change.",
    { id: z.string(), name: z.string().optional(), doc_type: DOC_TPL_TYPE.optional(), config: z.record(z.any()).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields: Record<string, any> = {};
      if (args.name !== undefined) fields.name = args.name.trim();
      if (args.doc_type !== undefined) fields.doc_type = args.doc_type;
      if (args.config !== undefined) {
        const { data: ex } = await t(ctx, "document_templates").select("config").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
        fields.config = { ...(ex?.config ?? {}), ...args.config };
      }
      if (Object.keys(fields).length === 0) return errorText("No fields to update.");
      const { error } = await t(ctx, "document_templates").update(fields).eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("set_default_document_template", "Make a template the default for its doc_type (clears the previous default).",
    { id: z.string() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { data: row } = await t(ctx, "document_templates").select("doc_type").eq("id", args.id).eq("business_id", ctx.businessId).maybeSingle();
      if (!row) return errorText("Template not found.");
      const overlap = row.doc_type === "both" ? ["invoice", "quote", "both"] : [row.doc_type, "both"];
      await t(ctx, "document_templates").update({ is_default: false }).eq("business_id", ctx.businessId).in("doc_type", overlap);
      const { error } = await t(ctx, "document_templates").update({ is_default: true }).eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ default: true });
    });

  tool("delete_document_template", "Delete a saved template. Documents using it revert to the business default.",
    { id: z.string() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const { error } = await t(ctx, "document_templates").delete().eq("id", args.id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("set_document_template", "Attach a saved template to a specific invoice or quote (or clear it with template_id null to fall back to the business default).",
    { doc_type: z.enum(["invoice", "quote"]), doc_id: z.string(), template_id: z.string().nullable() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const table = args.doc_type === "invoice" ? "invoices" : "quotes";
      const { error } = await t(ctx, table).update({ template_id: args.template_id }).eq("id", args.doc_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ attached: true });
    });

  // ===== STATS =====
  tool("get_business_stats", "Headline numbers: outstanding balance, paid this month, open quotes value, lead/job counts.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:read");
      const [{ data: inv }, { data: quotes }, { data: leads }, { data: jobs }] = await Promise.all([
        t(ctx, "invoices").select("status, total, amount_paid, issue_date").eq("business_id", ctx.businessId),
        t(ctx, "quotes").select("status, total").eq("business_id", ctx.businessId),
        t(ctx, "leads").select("status").eq("business_id", ctx.businessId),
        t(ctx, "work_orders").select("status").eq("business_id", ctx.businessId),
      ]);
      const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? 0))) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outstanding = (inv ?? []).filter((i: any) => ["sent", "partial", "overdue"].includes(i.status)).reduce((s: number, i: any) => s + (num(i.total) - num(i.amount_paid)), 0);
      const monthStart = new Date(); monthStart.setDate(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paidThisMonth = (inv ?? []).filter((i: any) => i.status === "paid" && new Date(i.issue_date) >= monthStart).reduce((s: number, i: any) => s + num(i.total), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openQuotes = (quotes ?? []).filter((q: any) => q.status === "sent").reduce((s: number, q: any) => s + num(q.total), 0);
      return text({
        outstanding, paidThisMonth, openQuotesValue: openQuotes,
        invoiceCount: (inv ?? []).length, quoteCount: (quotes ?? []).length,
        leadCount: (leads ?? []).length, jobCount: (jobs ?? []).length,
      });
    });

  // ===== CUSTOMERS (delete) =====
  tool("delete_customer", "Delete a customer. Their invoices/quotes keep their data but lose the customer link.",
    { customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { error } = await t(ctx, "customers").delete().eq("id", args.customer_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== QUOTES (update / delete / status / convert) =====
  tool("update_quote", "Update a quote's notes, terms, expiry, status or line items. Provide line_items to fully replace them (totals recomputed).",
    {
      quote_id: UUID, notes: z.string().optional(), terms: z.string().optional(),
      expiry_date: z.string().optional(), property_address: z.string().optional(),
      status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
      line_items: z.array(z.object({ name: z.string(), description: z.string().optional(), quantity: z.number().optional(), unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional() })).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = {};
      for (const k of ["notes", "terms", "expiry_date", "property_address", "status"] as const) if (args[k] !== undefined) patch[k] = args[k];
      if (args.line_items) {
        const { items, subtotal, tax_total, total } = buildLineItems(args.line_items);
        patch.line_items = items; patch.subtotal = subtotal; patch.tax_total = tax_total; patch.total = total;
      }
      if (Object.keys(patch).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "quotes").update(patch).eq("id", args.quote_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, quote: data });
    });

  tool("set_quote_status", "Set a quote's status.",
    { quote_id: UUID, status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write");
      const { error } = await t(ctx, "quotes").update({ status: args.status }).eq("id", args.quote_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("delete_quote", "Delete a quote.",
    { quote_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write");
      const { error } = await t(ctx, "quotes").delete().eq("id", args.quote_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("convert_quote_to_invoice", "Create an invoice from an accepted quote (copies line items + totals) and links them.",
    { quote_id: UUID, due_days: z.number().int().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write"); assertScope(ctx, "invoices:write");
      const { data: quote } = await t(ctx, "quotes").select("*").eq("id", args.quote_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!quote) return errorText("Quote not found");
      const { data: biz } = await t(ctx, "businesses").select("invoice_prefix, invoice_next_number").eq("id", ctx.businessId).single();
      const next = biz?.invoice_next_number ?? 1;
      const number = `${biz?.invoice_prefix ?? "INV"}-${String(next).padStart(4, "0")}`;
      await t(ctx, "businesses").update({ invoice_next_number: next + 1 }).eq("id", ctx.businessId);
      const issue = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + (args.due_days ?? 14) * 86_400_000).toISOString().split("T")[0];
      const { data: invoice, error } = await t(ctx, "invoices").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: quote.customer_id, number,
        issue_date: issue, due_date: due, line_items: quote.line_items,
        subtotal: quote.subtotal, discount_type: quote.discount_type ?? "fixed", discount_value: quote.discount_value ?? 0,
        discount_amount: quote.discount_amount ?? 0, tax_total: quote.tax_total, total: quote.total,
        amount_paid: 0, notes: quote.notes, terms: quote.terms, property_address: quote.property_address, status: "draft",
      }).select().single();
      if (error) throw error;
      await t(ctx, "quotes").update({ invoice_id: invoice.id, status: "accepted" }).eq("id", quote.id);
      return text({ created: true, invoice });
    });

  // ===== INVOICES (update / delete / payment / status) =====
  tool("update_invoice", "Update an invoice's notes, terms, due date, status or line items.",
    {
      invoice_id: UUID, notes: z.string().optional(), terms: z.string().optional(),
      due_date: z.string().optional(), property_address: z.string().optional(),
      status: z.enum(["draft", "sent", "partial", "paid", "overdue", "cancelled"]).optional(),
      line_items: z.array(z.object({ name: z.string(), description: z.string().optional(), quantity: z.number().optional(), unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional() })).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = {};
      for (const k of ["notes", "terms", "due_date", "property_address", "status"] as const) if (args[k] !== undefined) patch[k] = args[k];
      if (args.line_items) {
        const { items, subtotal, tax_total, total } = buildLineItems(args.line_items);
        patch.line_items = items; patch.subtotal = subtotal; patch.tax_total = tax_total; patch.total = total;
      }
      if (Object.keys(patch).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "invoices").update(patch).eq("id", args.invoice_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, invoice: data });
    });

  tool("set_invoice_status", "Set an invoice's status. Marking 'paid' also settles amount_paid, and (for deposit children) the parent invoice reconciles automatically.",
    { invoice_id: UUID, status: z.enum(["draft", "sent", "partial", "paid", "overdue", "cancelled"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { status: args.status };
      if (args.status === "paid") {
        const { data: cur } = await t(ctx, "invoices").select("total").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
        if (cur) patch.amount_paid = cur.total;  // DB trigger rolls this up to any parent
      }
      const { error } = await t(ctx, "invoices").update(patch).eq("id", args.invoice_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("add_invoice_payment", "Record a payment against an invoice. Recomputes amount_paid + status (partial/paid).",
    { invoice_id: UUID, amount: z.number().positive(), date: z.string().optional(), method: z.string().optional(), reference: z.string().optional(), notes: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: invoice } = await t(ctx, "invoices").select("total").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!invoice) return errorText("Invoice not found");
      const { error: payErr } = await t(ctx, "payments").insert({
        invoice_id: args.invoice_id, business_id: ctx.businessId, user_id: ctx.userId,
        amount: args.amount, date: args.date ?? new Date().toISOString().split("T")[0],
        method: args.method ?? null, reference: args.reference ?? null, notes: args.notes ?? null,
      });
      if (payErr) throw payErr;
      // Recompute from truth: direct payments + any child-invoice collections.
      const num = (v: unknown) => Number(v ?? 0) || 0;
      const { data: direct } = await t(ctx, "payments").select("amount").eq("invoice_id", args.invoice_id).eq("business_id", ctx.businessId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const directSum = (direct ?? []).reduce((s: number, r: any) => s + num(r.amount), 0);
      const { data: children } = await t(ctx, "invoices").select("amount_paid").eq("parent_invoice_id", args.invoice_id).eq("business_id", ctx.businessId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childSum = (children ?? []).reduce((s: number, r: any) => s + num(r.amount_paid), 0);
      const amountPaid = directSum + childSum;
      const status = amountPaid >= num(invoice.total) - 0.01 ? "paid" : "partial";
      await t(ctx, "invoices").update({ amount_paid: amountPaid, status }).eq("id", args.invoice_id);
      return text({ recorded: true, amount_paid: amountPaid, status });
    });

  tool("delete_invoice", "Delete an invoice.",
    { invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { error } = await t(ctx, "invoices").delete().eq("id", args.invoice_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== STRIPE PAYMENTS =====
  tool("get_stripe_status", "Check whether this business has connected Stripe and whether it can accept card payments.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:read");
      const { data: biz } = await t(ctx, "businesses")
        .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_country, platform_fee_percent, deposit_percent, currency")
        .eq("id", ctx.businessId).single();
      const { defaultPlatformFeePercent, DEFAULT_DEPOSIT_PERCENT } = await import("@/lib/stripe");
      return text({
        connected: !!biz?.stripe_account_id,
        account_id: biz?.stripe_account_id ?? null,
        charges_enabled: !!biz?.stripe_charges_enabled,
        payouts_enabled: !!biz?.stripe_payouts_enabled,
        details_submitted: !!biz?.stripe_details_submitted,
        country: biz?.stripe_country ?? null,
        currency: biz?.currency ?? null,
        platform_fee_percent: biz?.platform_fee_percent != null ? Number(biz.platform_fee_percent) : defaultPlatformFeePercent(),
        deposit_percent: biz?.deposit_percent != null ? Number(biz.deposit_percent) : DEFAULT_DEPOSIT_PERCENT,
      });
    });

  tool("create_stripe_payment_link", "Create a hosted Stripe Checkout Session for an unpaid invoice. Returns a URL the customer opens to pay with a card. Requires the business to have connected Stripe.",
    { invoice_id: UUID, amount: z.number().positive().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: biz } = await t(ctx, "businesses")
        .select("stripe_account_id, stripe_charges_enabled, currency, platform_fee_percent, name")
        .eq("id", ctx.businessId).single();
      if (!biz?.stripe_account_id || !biz.stripe_charges_enabled) {
        return errorText("Stripe isn't connected or charges aren't enabled. Connect from Settings → Payment first.");
      }
      const { data: invoice } = await t(ctx, "invoices")
        .select("id, number, total, amount_paid, customer_id")
        .eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!invoice) return errorText("Invoice not found");

      const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
      const requested = args.amount ?? balance;
      if (requested <= 0) return errorText("Nothing left to pay");
      if (requested > balance + 0.01) return errorText(`Amount exceeds balance (${balance.toFixed(2)})`);

      const { data: customer } = await t(ctx, "customers")
        .select("email").eq("id", invoice.customer_id).maybeSingle();

      const { getStripe, toStripeAmount, computeApplicationFeeAmount } = await import("@/lib/stripe");
      const stripe = getStripe();
      const currency = (biz.currency || "GBP").toLowerCase();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://kireihq.com";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency,
            product_data: { name: `Invoice ${invoice.number}` },
            unit_amount: toStripeAmount(requested, currency),
          },
          quantity: 1,
        }],
        payment_intent_data: (() => {
          const fee = computeApplicationFeeAmount(requested, currency, biz.platform_fee_percent != null ? Number(biz.platform_fee_percent) : null);
          return fee > 0 ? { application_fee_amount: fee } : undefined;
        })(),
        customer_email: customer?.email || undefined,
        success_url: `${baseUrl}/invoices/${invoice.id}?paid=1`,
        cancel_url:  `${baseUrl}/invoices/${invoice.id}?cancelled=1`,
        metadata: {
          kirei_invoice_id: invoice.id,
          kirei_business_id: ctx.businessId,
          kirei_source: "mcp",
        },
      }, { stripeAccount: biz.stripe_account_id });

      return text({ payment_url: session.url, expires_at: session.expires_at, amount: requested });
    });

  tool("create_revolut_payment_link", "Create a Revolut hosted-checkout link for an invoice's balance (card + Revolut Pay). Requires the business to have Revolut enabled in Settings → Payments. Returns a URL to send the customer.",
    { invoice_id: UUID, amount: z.number().positive().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: biz } = await t(ctx, "businesses")
        .select("revolut_enabled, revolut_secret_enc, revolut_mode, currency, name").eq("id", ctx.businessId).single();
      if (!biz?.revolut_enabled || !biz.revolut_secret_enc) return errorText("Revolut isn't enabled for this business.");

      const { data: invoice } = await t(ctx, "invoices")
        .select("id, number, total, amount_paid, customer_id").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!invoice) return errorText("Invoice not found.");

      const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
      const requested = args.amount ?? balance;
      if (requested < 0.5) return errorText("Nothing to pay on this invoice.");

      const { data: customer } = invoice.customer_id
        ? await t(ctx, "customers").select("email").eq("id", invoice.customer_id).maybeSingle()
        : { data: null };

      const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://kireihq.com";
      const order = await createRevolutOrder({
        secret: decryptSecret(biz.revolut_secret_enc),
        mode: (biz.revolut_mode as RevolutMode) ?? "sandbox",
        amountMinor: toRevolutAmount(requested),
        currency: (biz.currency as string) || "AUD",
        description: `Invoice ${invoice.number}`,
        customerEmail: customer?.email ?? null,
        reference: invoice.id,
        redirectUrl: `${base}/invoices/${invoice.id}?paid=1`,
      });
      if (!order.checkout_url) return errorText("Revolut did not return a checkout URL.");

      await t(ctx, "revolut_orders").upsert({
        order_id: order.id, business_id: ctx.businessId, invoice_id: invoice.id,
        amount: requested, currency: (biz.currency as string) || "AUD", portal_token: null,
      });

      return text({ payment_url: order.checkout_url, amount: requested });
    });

  tool("get_save_card_link", "Get a secure link to send a customer so they can save a card on file for automatic payments (autopay). Requires the business to have connected Stripe.",
    { customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { data: biz } = await t(ctx, "businesses").select("stripe_account_id, stripe_charges_enabled").eq("id", ctx.businessId).single();
      if (!biz?.stripe_account_id || !biz.stripe_charges_enabled) return errorText("Stripe isn't connected / charges not enabled.");
      const { data: cust } = await t(ctx, "customers").select("id").eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!cust) return errorText("Customer not found");
      const tok = await getOrMintPortalToken(ctx, args.customer_id);
      return text({ save_card_url: `${appBase()}/api/stripe/save-card?token=${tok}` });
    });

  tool("set_customer_autopay", "Turn automatic card charging (autopay) on or off for a customer. Off keeps any saved card but stops auto-charging their invoices.",
    { customer_id: UUID, enabled: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { error } = await t(ctx, "customers").update({ autopay_enabled: args.enabled }).eq("id", args.customer_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true, autopay_enabled: args.enabled });
    });

  tool("charge_saved_card", "Charge an invoice's outstanding balance to the customer's saved card right now (off-session). Fails cleanly if there's no saved card, the card needs authentication, or it's declined.",
    { invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { chargeInvoiceToSavedCard } = await import("@/lib/stripe-charge");
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const res = await chargeInvoiceToSavedCard(createAdminClient(), args.invoice_id, ctx.businessId);
      if (res.ok) return text({ charged: true, amount: res.amount, payment_intent_id: res.paymentIntentId });
      return errorText(`Couldn't charge saved card (${res.reason}): ${res.message}`);
    });

  // ===== LEADS (get / update / delete / convert) =====
  tool("get_lead", "Get one lead with all its fields.",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:read");
      const { data } = await t(ctx, "leads").select("*").eq("id", args.lead_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return errorText("Lead not found");
      return text(data);
    });

  tool("update_lead", "Update lead fields (name/phone/email/suburb/service/property_type/timing/notes).",
    {
      lead_id: UUID, name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(),
      suburb: z.string().optional(), service: z.string().optional(), property_type: z.string().optional(),
      timing: z.string().optional(), notes: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { lead_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "leads").update(clean).eq("id", lead_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, lead: data });
    });

  tool("delete_lead", "Delete a lead.",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { error } = await t(ctx, "leads").delete().eq("id", args.lead_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("set_lead_tags", "Replace a lead's tags with the given list (custom labels or preset labels).",
    { lead_id: UUID, tags: z.array(z.string()) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const clean = Array.from(new Set(args.tags.map((s: string) => s.trim()).filter(Boolean)));
      const { data, error } = await t(ctx, "leads").update({ tags: clean }).eq("id", args.lead_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, tags: clean, lead: data });
    });

  tool("list_lead_tag_presets", "List the business's preset lead tags.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:read");
      const { data, error } = await t(ctx, "lead_tag_presets").select("*").eq("business_id", ctx.businessId).order("label");
      if (error) throw error;
      return text(data);
    });

  tool("create_lead_tag_preset", "Create a preset lead tag (label + optional colour tone).",
    { label: z.string().min(1), color: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { data, error } = await t(ctx, "lead_tag_presets")
        .upsert({ business_id: ctx.businessId, label: args.label.trim(), color: args.color ?? null }, { onConflict: "business_id,label" })
        .select().single();
      if (error) throw error;
      return text({ created: true, preset: data });
    });

  tool("list_lead_notes", "List the notes on a lead's follow-up log (newest first).",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:read");
      const { data, error } = await t(ctx, "lead_notes").select("*").eq("lead_id", args.lead_id).eq("business_id", ctx.businessId).order("created_at", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("add_lead_note", "Add a timestamped note to a lead's follow-up log.",
    { lead_id: UUID, body: z.string().min(1) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write");
      const { data, error } = await t(ctx, "lead_notes")
        .insert({ business_id: ctx.businessId, lead_id: args.lead_id, user_id: ctx.userId, body: args.body.trim() })
        .select().single();
      if (error) throw error;
      return text({ added: true, note: data });
    });

  tool("list_attachments", "List files attached to a record (customer/work_order/invoice/quote/lead).",
    { entity_type: z.enum(["customer", "work_order", "invoice", "quote", "lead"]), entity_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "attachments:read");
      const { data, error } = await t(ctx, "attachments")
        .select("id, name, mime_type, size_bytes, created_at")
        .eq("business_id", ctx.businessId)
        .eq("entity_type", args.entity_type)
        .eq("entity_id", args.entity_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("delete_attachment", "Delete a file attachment by id.",
    { attachment_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "attachments:write");
      const { error } = await t(ctx, "attachments").delete().eq("id", args.attachment_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("list_payroll_employees", "List payroll employees (name, pay type, rate/salary, super %).",
    { include_inactive: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payroll:read");
      let q = t(ctx, "payroll_employees").select("*").eq("business_id", ctx.businessId).order("name");
      if (!args.include_inactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("create_payroll_employee", "Add a payroll employee.",
    { name: z.string().min(1), email: z.string().optional(), pay_type: z.enum(["hourly", "salary"]).optional(), hourly_rate: z.number().optional(), annual_salary: z.number().optional(), super_rate: z.number().optional(), member_profile_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payroll:write");
      const { data, error } = await t(ctx, "payroll_employees").insert({
        business_id: ctx.businessId, name: args.name.trim(), email: args.email ?? null,
        member_profile_id: args.member_profile_id ?? null, pay_type: args.pay_type ?? "hourly",
        hourly_rate: args.hourly_rate ?? 0, annual_salary: args.annual_salary ?? 0, super_rate: args.super_rate ?? 11.5,
      }).select().single();
      if (error) throw error;
      return text({ created: true, employee: data });
    });

  tool("list_pay_runs", "List pay runs (period, pay date, status, totals).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payroll:read");
      const { data, error } = await t(ctx, "pay_runs").select("*").eq("business_id", ctx.businessId).order("pay_date", { ascending: false });
      if (error) throw error;
      return text(data);
    });

  tool("get_pay_run", "Get a pay run with its per-employee lines.",
    { pay_run_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payroll:read");
      const { data: run } = await t(ctx, "pay_runs").select("*").eq("id", args.pay_run_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!run) return errorText("Pay run not found");
      const { data: lines } = await t(ctx, "pay_run_lines").select("*").eq("pay_run_id", args.pay_run_id).eq("business_id", ctx.businessId).order("name");
      return text({ run, lines: lines ?? [] });
    });

  tool("finalise_pay_run", "Finalise a pay run — locks it and posts wages + super to Expenses.",
    { pay_run_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "payroll:write");
      const { data: run } = await t(ctx, "pay_runs").select("*").eq("id", args.pay_run_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!run) return errorText("Pay run not found");
      const r = run as { status: string; gross_total: number; super_total: number; pay_date: string; period_start: string; period_end: string };
      if (r.status === "finalised") return text({ finalised: true, already: true });
      const period = `${r.period_start} → ${r.period_end}`;
      const mk = async (category: string, amount: number) => {
        if (amount <= 0) return null;
        const { data } = await t(ctx, "expenses").insert({ business_id: ctx.businessId, user_id: ctx.userId, category, amount, tax_amount: 0, spent_on: r.pay_date, description: `Payroll ${period}`, payment_method: "bank" }).select("id").single();
        return (data as { id: string } | null)?.id ?? null;
      };
      const wagesId = await mk("wages", Number(r.gross_total));
      const superId = await mk("superannuation", Number(r.super_total));
      const { error } = await t(ctx, "pay_runs").update({ status: "finalised", finalised_at: new Date().toISOString(), wages_expense_id: wagesId, super_expense_id: superId }).eq("id", args.pay_run_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ finalised: true });
    });

  tool("convert_lead_to_customer", "Create a customer from a lead and link them (sets lead status to contacted).",
    { lead_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write"); assertScope(ctx, "customers:write");
      const { data: lead } = await t(ctx, "leads").select("*").eq("id", args.lead_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!lead) return errorText("Lead not found");
      const { data: customer, error } = await t(ctx, "customers").insert({
        business_id: ctx.businessId, user_id: ctx.userId, name: lead.name,
        email: lead.email ?? null, phone: lead.phone ?? null, city: lead.suburb ?? null,
        notes: lead.notes ?? null, archived: false,
      }).select().single();
      if (error) throw error;
      await t(ctx, "leads").update({ customer_id: customer.id, status: lead.status === "new" ? "contacted" : lead.status }).eq("id", lead.id);
      return text({ created: true, customer });
    });

  // ===== WORK ORDERS (get / update / delete / status / assign / note) =====
  tool("get_work_order", "Get one work order with customer, assigned workers, photos count, and recent timeline.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data: wo } = await t(ctx, "work_orders").select("*, customers(name, phone, email)").eq("id", args.work_order_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!wo) return errorText("Work order not found");
      const [{ data: assignments }, { data: photos }] = await Promise.all([
        t(ctx, "work_order_assignments").select("member_profiles(id, name, email)").eq("work_order_id", args.work_order_id),
        t(ctx, "job_photos").select("id, phase, url").eq("work_order_id", args.work_order_id),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workers = (assignments ?? []).map((a: any) => a.member_profiles).filter(Boolean);
      return text({ ...wo, assigned_workers: workers, photo_count: (photos ?? []).length });
    });

  tool("update_work_order", "Update a work order's title / scope / schedule / address.",
    {
      work_order_id: UUID, title: z.string().optional(), description: z.string().optional(),
      scope_of_work: z.string().optional(), reported_issue: z.string().optional(), property_address: z.string().optional(),
      scheduled_date: z.string().optional(), start_time: z.string().optional(), end_time: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { work_order_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "work_orders").update(clean).eq("id", work_order_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, work_order: data });
    });

  tool("set_work_order_status", "Set a work order's status.",
    { work_order_id: UUID, status: z.enum(["draft", "assigned", "in_progress", "submitted", "reviewed", "completed", "cancelled"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "work_orders").update({ status: args.status }).eq("id", args.work_order_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("assign_workers", "Assign team members to a work order by their member_profile IDs (use list_team to resolve names). Replaces the current assignment set.",
    { work_order_id: UUID, member_profile_ids: z.array(UUID) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      await t(ctx, "work_order_assignments").delete().eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId);
      if (args.member_profile_ids.length > 0) {
        const rows = args.member_profile_ids.map((pid: string) => ({
          work_order_id: args.work_order_id, business_id: ctx.businessId, member_profile_id: pid, assigned_by: ctx.userId,
        }));
        const { error } = await t(ctx, "work_order_assignments").insert(rows);
        if (error) throw error;
        await t(ctx, "work_orders").update({ status: "assigned" }).eq("id", args.work_order_id).eq("business_id", ctx.businessId).eq("status", "draft");
      }
      return text({ assigned: args.member_profile_ids.length });
    });

  tool("add_work_order_note", "Add a note to a work order's timeline.",
    { work_order_id: UUID, note: z.string().min(1), visible_to_customer: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "job_timeline_events").insert({
        business_id: ctx.businessId, work_order_id: args.work_order_id, type: "note_added",
        payload: { content: args.note }, actor_type: "user", actor_label: "Claude",
        visible_to_customer: args.visible_to_customer ?? false, occurred_at: new Date().toISOString(),
      });
      if (error) throw error;
      return text({ added: true });
    });

  tool("delete_work_order", "Delete a work order and its photos.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "work_orders").delete().eq("id", args.work_order_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== TASKS (update / delete) =====
  tool("update_task", "Update a task's title / description / priority / due date / tags.",
    {
      task_id: UUID, title: z.string().optional(), description: z.string().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(), due_date: z.string().optional(), tags: z.array(z.string()).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "tasks:write");
      const { task_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "tasks").update(clean).eq("id", task_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, task: data });
    });

  tool("delete_task", "Delete a task.",
    { task_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "tasks:write");
      const { error } = await t(ctx, "tasks").delete().eq("id", args.task_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== PRODUCTS (update / delete) =====
  tool("update_product", "Update a catalog product.",
    { product_id: UUID, name: z.string().optional(), unit_price: z.number().optional(), tax_rate: z.number().optional(), description: z.string().optional(), unit: z.string().optional(), archived: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      const { product_id, ...patch } = args;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "products").update(clean).eq("id", product_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, product: data });
    });

  tool("delete_product", "Delete a catalog product.",
    { product_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "products:write");
      const { error } = await t(ctx, "products").delete().eq("id", args.product_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== SITES (per-customer properties) =====
  tool("list_sites", "List a customer's sites / properties.",
    { customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      const { data, error } = await t(ctx, "sites").select("id, label, address, city, state, postcode, gate_code, parking_notes, access_notes, archived")
        .eq("business_id", ctx.businessId).eq("account_id", args.customer_id).order("created_at");
      if (error) throw error;
      return text(data);
    });

  tool("create_site", "Add a site / property to a customer.",
    {
      customer_id: UUID, label: z.string().optional(), address: z.string().optional(), city: z.string().optional(),
      state: z.string().optional(), postcode: z.string().optional(), gate_code: z.string().optional(),
      parking_notes: z.string().optional(), access_notes: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { customer_id, ...rest } = args;
      const { data, error } = await t(ctx, "sites").insert({
        business_id: ctx.businessId, account_id: customer_id, archived: false,
        ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v ?? null])),
      }).select().single();
      if (error) throw error;
      return text({ created: true, site: data });
    });

  // ===== CONTACTS (per-customer contacts) =====
  tool("list_contacts", "List a customer's contacts (booker / on-site / billing people).",
    { customer_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      const { data, error } = await t(ctx, "account_contacts").select("id, name, email, phone, role, notes, archived")
        .eq("business_id", ctx.businessId).eq("account_id", args.customer_id).order("created_at");
      if (error) throw error;
      return text(data);
    });

  tool("create_contact", "Add a contact to a customer.",
    { customer_id: UUID, name: z.string().min(1), email: z.string().optional(), phone: z.string().optional(), role: z.string().optional(), notes: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { data, error } = await t(ctx, "account_contacts").insert({
        business_id: ctx.businessId, account_id: args.customer_id, name: args.name,
        email: args.email ?? null, phone: args.phone ?? null, role: args.role ?? "other", notes: args.notes ?? null, archived: false,
      }).select().single();
      if (error) throw error;
      return text({ created: true, contact: data });
    });

  // ===== TEAM =====
  tool("list_team", "List the business's team member profiles (id, name, email, role title) — use the IDs with assign_workers.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data, error } = await t(ctx, "member_profiles").select("id, name, email, role_title, skills, is_active").eq("business_id", ctx.businessId).order("name");
      if (error) throw error;
      return text(data);
    });

  // ===== RECURRING =====
  tool("list_recurring", "List recurring job templates.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data, error } = await t(ctx, "recurring_jobs").select("id, name, title, cadence, active, next_occurrence_at, customer_id").eq("business_id", ctx.businessId).order("next_occurrence_at");
      if (error) throw error;
      return text(data);
    });

  tool("set_recurring_active", "Pause or resume a recurring job.",
    { recurring_id: UUID, active: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "recurring_jobs").update({ active: args.active }).eq("id", args.recurring_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("create_recurring_job", "Create a recurring job schedule. The cron generates a work order each cycle. Optionally auto_invoice (raise an invoice from invoice_line_items each time) and auto_charge (charge the customer's saved card off-session). next_occurrence_at is the first job date (YYYY-MM-DD).",
    {
      name: z.string().min(1), title: z.string().min(1),
      description: z.string().optional(), customer_id: UUID.optional(), property_address: z.string().optional(),
      cadence: z.enum(["weekly", "fortnightly", "monthly", "quarterly"]),
      next_occurrence_at: z.string(),
      generate_days_ahead: z.number().int().optional(),
      ends_on: z.string().optional(),
      auto_invoice: z.boolean().optional(),
      auto_charge: z.boolean().optional(),
      invoice_line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const items = args.invoice_line_items ? buildLineItems(args.invoice_line_items).items : [];
      const { data, error } = await t(ctx, "recurring_jobs").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name, title: args.title, description: args.description ?? null,
        customer_id: args.customer_id ?? null, property_address: args.property_address ?? null,
        member_profile_ids: [],
        cadence: args.cadence, next_occurrence_at: args.next_occurrence_at,
        generate_days_ahead: args.generate_days_ahead ?? 14, ends_on: args.ends_on ?? null,
        active: true,
        auto_invoice: args.auto_invoice ?? false,
        auto_charge: args.auto_charge ?? false,
        invoice_line_items: items,
      }).select().single();
      if (error) throw error;
      return text({ created: true, recurring_job: data });
    });

  tool("update_recurring_job", "Update a recurring job. Only provided fields change. Set auto_invoice/auto_charge + invoice_line_items to turn on automatic billing for the generated jobs.",
    {
      recurring_id: UUID,
      name: z.string().optional(), title: z.string().optional(), description: z.string().optional(),
      customer_id: UUID.optional(), property_address: z.string().optional(),
      cadence: z.enum(["weekly", "fortnightly", "monthly", "quarterly"]).optional(),
      next_occurrence_at: z.string().optional(), ends_on: z.string().nullable().optional(),
      active: z.boolean().optional(),
      auto_invoice: z.boolean().optional(), auto_charge: z.boolean().optional(),
      invoice_line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { recurring_id, invoice_line_items, ...rest } = args;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (invoice_line_items) patch.invoice_line_items = buildLineItems(invoice_line_items).items;
      if (Object.keys(patch).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "recurring_jobs").update(patch).eq("id", recurring_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, recurring_job: data });
    });

  tool("delete_recurring_job", "Delete a recurring job schedule (stops future job generation; existing jobs are unaffected).",
    { recurring_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "recurring_jobs").delete().eq("id", args.recurring_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== RECURRING INVOICES (subscriptions / automatic billing) =====
  tool("list_recurring_invoices", "List recurring invoice schedules (subscriptions that auto-generate + auto-charge an invoice each cycle).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:read");
      const { data, error } = await t(ctx, "recurring_invoices")
        .select("id, name, customer_id, total, cadence, next_run_on, auto_charge, active, last_run_at")
        .eq("business_id", ctx.businessId).order("next_run_on");
      if (error) throw error;
      return text(data);
    });

  tool("create_recurring_invoice", "Create a recurring invoice schedule. Each cycle it auto-generates an invoice from these line items and (if auto_charge) charges the customer's saved card off-session, else emails it with a pay link. next_run_on is the first billing date (YYYY-MM-DD).",
    {
      customer_id: UUID,
      name: z.string().min(1),
      line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).min(1),
      cadence: z.enum(["weekly", "fortnightly", "monthly", "quarterly"]),
      next_run_on: z.string(),
      due_days: z.number().int().optional(),
      auto_charge: z.boolean().optional(),
      send_email: z.boolean().optional(),
      ends_on: z.string().optional(),
      notes: z.string().optional(),
      terms: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { items, subtotal, tax_total, total } = buildLineItems(args.line_items);
      const { data, error } = await t(ctx, "recurring_invoices").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name, customer_id: args.customer_id,
        line_items: items, subtotal, tax_total, total,
        cadence: args.cadence, next_run_on: args.next_run_on,
        due_days: args.due_days ?? 14,
        auto_charge: args.auto_charge ?? true,
        send_email: args.send_email ?? true,
        ends_on: args.ends_on ?? null,
        notes: args.notes ?? null, terms: args.terms ?? null,
        active: true,
      }).select().single();
      if (error) throw error;
      return text({ created: true, recurring_invoice: data });
    });

  tool("set_recurring_invoice_active", "Pause or resume a recurring invoice schedule.",
    { recurring_invoice_id: UUID, active: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { error } = await t(ctx, "recurring_invoices").update({ active: args.active }).eq("id", args.recurring_invoice_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("run_recurring_invoice_now", "Generate this schedule's invoice immediately (auto-charge / email per its settings) without waiting for the daily cron. Does not change the schedule's next run date.",
    { recurring_invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: r } = await t(ctx, "recurring_invoices").select("*").eq("id", args.recurring_invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!r) return errorText("Recurring invoice not found");
      const { generateRecurringInvoice } = await import("@/lib/recurring/generate-invoice");
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const out = await generateRecurringInvoice(createAdminClient(), {
        businessId: ctx.businessId, userId: r.user_id, customerId: r.customer_id,
        lineItems: r.line_items ?? [], subtotal: Number(r.subtotal), taxTotal: Number(r.tax_total), total: Number(r.total),
        dueDays: r.due_days ?? 14, notes: r.notes, terms: r.terms,
        autoCharge: r.auto_charge, sendEmail: r.send_email,
      });
      await t(ctx, "recurring_invoices").update({ last_invoice_id: out.invoiceId, last_run_at: new Date().toISOString() }).eq("id", args.recurring_invoice_id);
      return text({ generated: true, invoice_number: out.number, charged: out.charged, emailed: out.emailed });
    });

  tool("update_recurring_invoice", "Update a recurring invoice schedule. Only provided fields change; passing line_items replaces them and recomputes totals.",
    {
      recurring_invoice_id: UUID,
      name: z.string().optional(),
      line_items: z.array(z.object({
        name: z.string(), description: z.string().optional(), quantity: z.number().optional(),
        unit_price: z.number(), tax_rate: z.number().optional(), discount_percent: z.number().optional(),
      })).optional(),
      cadence: z.enum(["weekly", "fortnightly", "monthly", "quarterly"]).optional(),
      next_run_on: z.string().optional(),
      due_days: z.number().int().optional(),
      auto_charge: z.boolean().optional(),
      send_email: z.boolean().optional(),
      ends_on: z.string().nullable().optional(),
      notes: z.string().optional(),
      terms: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { recurring_invoice_id, line_items, ...rest } = args;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (line_items) {
        const { items, subtotal, tax_total, total } = buildLineItems(line_items);
        patch.line_items = items; patch.subtotal = subtotal; patch.tax_total = tax_total; patch.total = total;
      }
      if (Object.keys(patch).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "recurring_invoices").update(patch).eq("id", recurring_invoice_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, recurring_invoice: data });
    });

  tool("delete_recurring_invoice", "Delete a recurring invoice schedule (stops future automatic invoices; already-created invoices are unaffected).",
    { recurring_invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { error } = await t(ctx, "recurring_invoices").delete().eq("id", args.recurring_invoice_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  // ===== CUSTOMER PORTAL LINKS =====
  tool("get_portal_links",
    "Get shareable customer-portal (hub) links for a customer, plus optional deep links to a specific invoice / quote / report. The customer opens these without logging in. Pass a customer_id, or an invoice_id / quote_id / report_id to resolve the customer automatically.",
    { customer_id: UUID.optional(), invoice_id: UUID.optional(), quote_id: UUID.optional(), report_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      let customerId = args.customer_id ?? null;
      const resolve = async (table: string, id?: string) => {
        if (!id || customerId) return;
        const { data } = await t(ctx, table).select("customer_id").eq("id", id).eq("business_id", ctx.businessId).maybeSingle();
        if (data?.customer_id) customerId = data.customer_id as string;
      };
      await resolve("invoices", args.invoice_id);
      await resolve("quotes", args.quote_id);
      await resolve("reports", args.report_id);
      if (!customerId) return errorText("Provide a customer_id, or an invoice/quote/report id that belongs to a customer.");

      const token = await getOrMintPortalToken(ctx, customerId);
      const base = appBase();
      const out: Record<string, string> = { customer_id: customerId, hub_url: `${base}/portal/${token}` };
      if (args.invoice_id) out.invoice_url = `${base}/portal/${token}/invoice/${args.invoice_id}`;
      if (args.quote_id) out.quote_url = `${base}/portal/${token}/quote/${args.quote_id}`;
      if (args.report_id) out.report_url = `${base}/portal/${token}/report/${args.report_id}`;
      return text(out);
    });

  // ===== PLUGINS · PRESETS · FORM BUILDER · ONBOARDING · CONTRACTS =====
  // Registered from ./tools/plugin-form-tools to keep this file focused.
  registerPluginFormTools(tool);
  registerLeadFormTools(tool);

  // ===== SEO PRODUCTION (docs/SEO_AGENCY_PLAN.md, Phase 2) =====
  registerSeoTools(tool);

  // ===== CONTENT STUDIO =====
  registerContentTools(tool);

  // ===== EXPENSES & JOB COSTING =====
  registerExpenseTools(tool);
  registerRecurringExpenseTools(tool);

  registerMaterialTools(tool);

  // ===== INVENTORY & STOCK =====
  registerInventoryTools(tool);

  // ===== TIMESHEETS & PAYROLL =====
  registerTimesheetTools(tool);

  // ===== ASSETS & EQUIPMENT =====
  registerAssetTools(tool);

  // ===== AI ASSISTANT =====
  registerAssistantTools(tool);

  // ===== PROSPECTS =====
  registerProspectTools(tool);
  registerVaultTools(tool);
  registerOutreachTools(tool);
  registerTelephonyTools(tool);

  // ===== SCHEDULE =====
  tool("get_schedule", "Get jobs scheduled on a given date (YYYY-MM-DD), or today if omitted.",
    { date: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const date = args.date ?? new Date().toISOString().split("T")[0];
      const { data, error } = await t(ctx, "work_orders").select("id, number, title, status, start_time, end_time, property_address, customers(name)")
        .eq("business_id", ctx.businessId).eq("scheduled_date", date).order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return text({ date, jobs: data });
    });

  // ===== QUOTES / INVOICES — duplicate =====
  tool("duplicate_quote", "Create a fresh draft copy of an existing quote (new number, today's issue date).",
    { quote_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "quotes:write");
      const { data: q } = await t(ctx, "quotes").select("*").eq("id", args.quote_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!q) return errorText("Quote not found");
      const number = await mintNumber(ctx, "quote_prefix", "quote_next_number", "QT");
      const issue = new Date().toISOString().split("T")[0];
      const expiry = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];
      const { data, error } = await t(ctx, "quotes").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: q.customer_id, number,
        issue_date: issue, expiry_date: expiry, line_items: q.line_items,
        subtotal: q.subtotal, discount_type: q.discount_type ?? "fixed", discount_value: q.discount_value ?? 0,
        discount_amount: q.discount_amount ?? 0, tax_total: q.tax_total, total: q.total,
        notes: q.notes, terms: q.terms, property_address: q.property_address, status: "draft", invoice_id: null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, quote: data });
    });

  tool("duplicate_invoice", "Create a fresh draft copy of an existing invoice (new number, today's issue date, unpaid).",
    { invoice_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "invoices:write");
      const { data: inv } = await t(ctx, "invoices").select("*").eq("id", args.invoice_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!inv) return errorText("Invoice not found");
      const number = await mintNumber(ctx, "invoice_prefix", "invoice_next_number", "INV");
      const issue = new Date().toISOString().split("T")[0];
      const due = new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0];
      const { data, error } = await t(ctx, "invoices").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: inv.customer_id, number,
        issue_date: issue, due_date: due, line_items: inv.line_items,
        subtotal: inv.subtotal, discount_type: inv.discount_type ?? "fixed", discount_value: inv.discount_value ?? 0,
        discount_amount: inv.discount_amount ?? 0, tax_total: inv.tax_total, total: inv.total,
        amount_paid: 0, notes: inv.notes, terms: inv.terms, property_address: inv.property_address, status: "draft",
      }).select().single();
      if (error) throw error;
      return text({ created: true, invoice: data });
    });

  // ===== LEADS — convert to quote / work order =====
  tool("convert_lead_to_quote", "Create a customer (if not linked) + a draft quote from a lead, and link them (lead → quoted).",
    { lead_id: UUID, expiry_days: z.number().int().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write"); assertScope(ctx, "quotes:write");
      const customerId = await ensureCustomerForLead(ctx, args.lead_id);
      if (!customerId) return errorText("Lead not found");
      const number = await mintNumber(ctx, "quote_prefix", "quote_next_number", "QT");
      const issue = new Date().toISOString().split("T")[0];
      const expiry = new Date(Date.now() + (args.expiry_days ?? 30) * 86_400_000).toISOString().split("T")[0];
      const { data: quote, error } = await t(ctx, "quotes").insert({
        business_id: ctx.businessId, user_id: ctx.userId, customer_id: customerId, number,
        issue_date: issue, expiry_date: expiry, line_items: [], subtotal: 0,
        discount_type: "fixed", discount_value: 0, discount_amount: 0, tax_total: 0, total: 0,
        status: "draft", invoice_id: null,
      }).select().single();
      if (error) throw error;
      await t(ctx, "leads").update({ customer_id: customerId, quote_id: quote.id, status: "quoted" }).eq("id", args.lead_id).eq("business_id", ctx.businessId);
      return text({ created: true, quote, customer_id: customerId });
    });

  tool("convert_lead_to_work_order", "Create a customer (if not linked) + a work order from a lead, and link them (lead → won).",
    { lead_id: UUID, scheduled_date: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "leads:write"); assertScope(ctx, "work_orders:write");
      const customerId = await ensureCustomerForLead(ctx, args.lead_id);
      if (!customerId) return errorText("Lead not found");
      const { data: lead } = await t(ctx, "leads").select("name, service, suburb, notes").eq("id", args.lead_id).eq("business_id", ctx.businessId).maybeSingle();
      const number = await mintNumber(ctx, "work_order_prefix", "work_order_next_number", "WO");
      const { data: wo, error } = await t(ctx, "work_orders").insert({
        business_id: ctx.businessId, user_id: ctx.userId, number,
        title: lead?.service ? `${lead.service} — ${lead?.name ?? ""}`.trim() : (lead?.name ?? "New job"),
        customer_id: customerId, property_address: lead?.suburb ?? null,
        reported_issue: lead?.notes ?? null, scheduled_date: args.scheduled_date ?? null, status: "draft", photos: [],
      }).select().single();
      if (error) throw error;
      await t(ctx, "leads").update({ customer_id: customerId, status: "won" }).eq("id", args.lead_id).eq("business_id", ctx.businessId);
      return text({ created: true, work_order: wo, customer_id: customerId });
    });

  // ===== WORK ORDERS — share link / financials / materials / time =====
  tool("enable_work_order_share_link", "Generate (or reuse) a public customer share link for a work order. Returns the /jobs/<token> URL.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { data: wo } = await t(ctx, "work_orders").select("share_token").eq("id", args.work_order_id).eq("business_id", ctx.businessId).maybeSingle();
      if (!wo) return errorText("Work order not found");
      let token = wo.share_token as string | null;
      if (!token) {
        token = `${randomBytes(16).toString("hex")}${randomBytes(4).toString("hex")}`;
        const { error } = await t(ctx, "work_orders").update({ share_token: token, share_enabled_at: new Date().toISOString() }).eq("id", args.work_order_id).eq("business_id", ctx.businessId);
        if (error) throw error;
      }
      return text({ enabled: true, url: `${appBase()}/jobs/${token}` });
    });

  tool("disable_work_order_share_link", "Revoke a work order's public share link.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "work_orders").update({ share_token: null, share_enabled_at: null }).eq("id", args.work_order_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ disabled: true });
    });

  tool("get_work_order_financials", "Get a work order's linked quotes + invoices and its unbilled materials/time totals.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const num = (v: unknown) => Number(v ?? 0) || 0;
      const [{ data: quotes }, { data: invoices }, { data: materials }, { data: time }] = await Promise.all([
        t(ctx, "quotes").select("id, number, status, total").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId),
        t(ctx, "invoices").select("id, number, status, total, amount_paid").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId),
        t(ctx, "job_materials").select("name, qty, unit_price, billable, invoice_id").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId),
        t(ctx, "job_time_entries").select("duration_seconds, invoice_id").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unbilledMaterials = (materials ?? []).filter((m: any) => m.billable && !m.invoice_id).reduce((s: number, m: any) => s + num(m.qty) * num(m.unit_price), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unbilledSeconds = (time ?? []).filter((e: any) => !e.invoice_id).reduce((s: number, e: any) => s + num(e.duration_seconds), 0);
      return text({ quotes, invoices, unbilledMaterials, unbilledTimeHours: Math.round((unbilledSeconds / 3600) * 100) / 100 });
    });

  tool("list_job_materials", "List materials logged on a work order.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data, error } = await t(ctx, "job_materials").select("id, name, qty, unit, unit_cost, unit_price, billable, invoice_id").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId).order("added_at");
      if (error) throw error;
      return text(data);
    });

  tool("add_job_material", "Add a material line to a work order.",
    { work_order_id: UUID, name: z.string().min(1), qty: z.number().optional(), unit: z.string().optional(), unit_cost: z.number().optional(), unit_price: z.number().optional(), billable: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { data, error } = await t(ctx, "job_materials").insert({
        business_id: ctx.businessId, work_order_id: args.work_order_id, added_by: ctx.userId,
        name: args.name, qty: args.qty ?? 1, unit: args.unit ?? null,
        unit_cost: args.unit_cost ?? 0, unit_price: args.unit_price ?? args.unit_cost ?? 0,
        billable: args.billable ?? true,
      }).select().single();
      if (error) throw error;
      return text({ added: true, material: data });
    });

  tool("list_job_time", "List time entries logged on a work order.",
    { work_order_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data, error } = await t(ctx, "job_time_entries").select("id, type, started_at, ended_at, duration_seconds, notes, invoice_id").eq("work_order_id", args.work_order_id).eq("business_id", ctx.businessId).order("started_at");
      if (error) throw error;
      return text(data);
    });

  tool("log_time_block", "Log a completed block of time on a work order (minutes).",
    { work_order_id: UUID, minutes: z.number().positive(), type: z.enum(["work", "travel", "break"]).optional(), notes: z.string().optional(), started_at: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const started = args.started_at ?? new Date(Date.now() - args.minutes * 60_000).toISOString();
      const ended = new Date(new Date(started).getTime() + args.minutes * 60_000).toISOString();
      const { data, error } = await t(ctx, "job_time_entries").insert({
        business_id: ctx.businessId, work_order_id: args.work_order_id, user_id: ctx.userId,
        type: args.type ?? "work", started_at: started, ended_at: ended,
        duration_seconds: Math.round(args.minutes * 60), notes: args.notes ?? null,
      }).select().single();
      if (error) throw error;
      return text({ logged: true, time_entry: data });
    });

  // ===== ONLINE BOOKING =====
  tool("list_booking_forms", "List this business's booking forms (each has its own public slug, rules and selected services/resources).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      const { data } = await t(ctx, "booking_forms").select("*").eq("business_id", ctx.businessId).order("created_at");
      return text(data ?? []);
    });

  tool("create_booking_form", "Create a new booking form. Returns it (set a slug + enabled via update_booking_form to publish).",
    { name: z.string().min(1) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { data, error } = await t(ctx, "booking_forms").insert({ business_id: ctx.businessId, name: args.name }).select().single();
      if (error) throw error;
      return text({ created: true, form: data });
    });

  // ===== WORK-ORDER PHOTOS =====
  tool("list_job_photos", "List the photos uploaded to a work order (metadata only — id, url, phase, taken_at, caption). Use view_job_photos to actually see the images.",
    { work_order_id: UUID, phase: z.enum(["before", "during", "after"]).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      let q = t(ctx, "job_photos").select("id, url, phase, taken_at, caption, lat, lng")
        .eq("business_id", ctx.businessId).eq("work_order_id", args.work_order_id)
        .order("taken_at", { ascending: true });
      if (args.phase) q = q.eq("phase", args.phase);
      const { data, error } = await q;
      if (error) throw error;
      return text({ total: data?.length ?? 0, photos: data });
    });

  tool("view_job_photos", "Fetch and return the actual images of a work order so Claude can see them. Returns up to `limit` images (default 5, max 10) starting at `offset`. For lots of photos, paginate or filter by phase. Use list_job_photos first to see counts.",
    {
      work_order_id: UUID,
      limit: z.number().int().min(1).max(10).optional(),
      offset: z.number().int().min(0).optional(),
      phase: z.enum(["before", "during", "after"]).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      let q = t(ctx, "job_photos").select("id, url, phase, taken_at, caption")
        .eq("business_id", ctx.businessId).eq("work_order_id", args.work_order_id)
        .order("taken_at", { ascending: true });
      if (args.phase) q = q.eq("phase", args.phase);
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as Array<{ id: string; url: string; phase: string; taken_at: string; caption: string | null }>;
      const limit = args.limit ?? 5;
      const offset = args.offset ?? 0;
      const slice = all.slice(offset, offset + limit);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any[] = [{
        type: "text", text: JSON.stringify({
          work_order_id: args.work_order_id, total: all.length,
          returning: slice.length, offset, limit, phase_filter: args.phase ?? null,
          photos: slice.map((p) => ({ id: p.id, url: p.url, phase: p.phase, taken_at: p.taken_at, caption: p.caption })),
        }, null, 2),
      }];

      for (const p of slice) {
        try {
          const res = await fetch(p.url);
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const lower = p.url.toLowerCase();
          const mimeType = res.headers.get("content-type")
            || (lower.endsWith(".png") ? "image/png"
              : lower.endsWith(".webp") ? "image/webp"
              : lower.endsWith(".heic") ? "image/heic"
              : "image/jpeg");
          blocks.push({ type: "image", data: buf.toString("base64"), mimeType });
        } catch { /* skip unreachable photo */ }
      }
      return { content: blocks };
    });

  // ===== WORK-ORDER TEMPLATES =====
  tool("list_work_order_templates", "List the saved work-order templates (e.g. Inspection, Rectification). Used to prefill the New Work Order form.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:read");
      const { data, error } = await t(ctx, "work_order_templates").select("*").eq("business_id", ctx.businessId).order("sort_order");
      if (error) throw error;
      return text(data);
    });

  tool("create_work_order_template", "Create a work-order template (name + optional default fields applied to new work orders).",
    {
      name: z.string().min(1),
      title: z.string().optional(), description: z.string().optional(),
      scope_of_work: z.string().optional(), worker_notes: z.string().optional(),
      reported_issue: z.string().optional(),
      default_duration_minutes: z.number().int().min(0).nullable().optional(),
      sort_order: z.number().int().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { data, error } = await t(ctx, "work_order_templates").insert({
        business_id: ctx.businessId, name: args.name,
        title: args.title ?? null, description: args.description ?? null,
        scope_of_work: args.scope_of_work ?? null, worker_notes: args.worker_notes ?? null,
        reported_issue: args.reported_issue ?? null,
        default_duration_minutes: args.default_duration_minutes ?? null,
        sort_order: args.sort_order ?? 0,
      }).select().single();
      if (error) throw error;
      return text({ created: true, template: data });
    });

  tool("update_work_order_template", "Update a work-order template. Only provided fields change.",
    {
      template_id: UUID,
      name: z.string().optional(),
      title: z.string().nullable().optional(), description: z.string().nullable().optional(),
      scope_of_work: z.string().nullable().optional(), worker_notes: z.string().nullable().optional(),
      reported_issue: z.string().nullable().optional(),
      default_duration_minutes: z.number().int().min(0).nullable().optional(),
      sort_order: z.number().int().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { template_id, ...rest } = args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const { data, error } = await t(ctx, "work_order_templates").update(patch).eq("id", template_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, template: data });
    });

  tool("delete_work_order_template", "Delete a work-order template.",
    { template_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "work_orders:write");
      const { error } = await t(ctx, "work_order_templates").delete().eq("id", args.template_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("set_block_untimed_jobs", "Business-level toggle: when true, a day is blocked from booking if a linked worker has an UNTIMED (all-day) job that day. Timed jobs always block their exact slot.",
    { enabled: z.boolean() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      await t(ctx, "booking_settings").upsert({ business_id: ctx.businessId, block_untimed_jobs: args.enabled }, { onConflict: "business_id" });
      return text({ updated: true, block_untimed_jobs: args.enabled });
    });

  tool("get_booking_settings", "Get the default booking form (enabled flag, public slug, timezone, rules, required fields, reminders). Use list_booking_forms for all forms.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      const { data } = await t(ctx, "booking_forms").select("*").eq("business_id", ctx.businessId).order("created_at").limit(1).maybeSingle();
      return text(data ?? { enabled: false, note: "No booking form yet — call create_booking_form." });
    });

  tool("update_booking_form", "Update a booking form (or the default form if form_id omitted). Only provided fields change. Set enabled=true + a slug to publish.",
    {
      form_id: UUID.optional(),
      enabled: z.boolean().optional(), slug: z.string().optional(), name: z.string().optional(), timezone: z.string().optional(),
      min_lead_minutes: z.number().int().min(0).optional(), max_advance_days: z.number().int().min(1).optional(),
      slot_granularity_minutes: z.number().int().min(1).optional(), default_buffer_minutes: z.number().int().min(0).optional(),
      max_per_day: z.number().int().min(0).nullable().optional(),
      require_phone: z.boolean().optional(), require_email: z.boolean().optional(), require_address: z.boolean().optional(),
      show_resource_names: z.boolean().optional(),
      confirmation_message: z.string().nullable().optional(), cancellation_window_hours: z.number().int().min(0).optional(),
      reminder_offsets: z.array(z.number().int()).optional(),
      create_lead: z.boolean().optional(), create_work_order: z.boolean().optional(),
      appointment_type_ids: z.array(UUID).optional(), resource_ids: z.array(UUID).optional(),
      notify_customer_email: z.boolean().optional(), notify_customer_sms: z.boolean().optional(),
      notify_team_email: z.boolean().optional(), team_notify_email: z.string().nullable().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { form_id, ...rest } = args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      let id = form_id as string | undefined;
      if (!id) {
        const { data: f } = await t(ctx, "booking_forms").select("id").eq("business_id", ctx.businessId).order("created_at").limit(1).maybeSingle();
        if (!f) throw new Error("No booking form — call create_booking_form first");
        id = f.id;
      }
      const { data, error } = await t(ctx, "booking_forms").update(patch).eq("id", id).eq("business_id", ctx.businessId).select("*").single();
      if (error) throw error;
      return text({ updated: true, form: data });
    });

  tool("list_appointment_types", "List the bookable services (appointment types).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      const { data, error } = await t(ctx, "appointment_types").select("*").eq("business_id", ctx.businessId).order("sort_order");
      if (error) throw error;
      return text(data);
    });

  tool("create_appointment_type", "Create a bookable service.",
    {
      name: z.string().min(1), duration_minutes: z.number().int().min(1),
      description: z.string().optional(), buffer_minutes: z.number().int().min(0).optional(),
      price_display: z.string().optional(), color: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { data, error } = await t(ctx, "appointment_types").insert({
        business_id: ctx.businessId, name: args.name, duration_minutes: args.duration_minutes,
        description: args.description ?? null, buffer_minutes: args.buffer_minutes ?? null,
        price_display: args.price_display ?? null, color: args.color ?? null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, appointment_type: data });
    });

  tool("list_booking_resources", "List bookable resources (usually team members).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      const { data, error } = await t(ctx, "booking_resources").select("*").eq("business_id", ctx.businessId).order("sort_order");
      if (error) throw error;
      return text(data);
    });

  tool("create_booking_resource", "Create a bookable resource. display_name is shown publicly (use a first name).",
    { display_name: z.string().min(1), member_profile_id: UUID.optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { data, error } = await t(ctx, "booking_resources").insert({
        business_id: ctx.businessId, display_name: args.display_name, member_profile_id: args.member_profile_id ?? null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, resource: data });
    });

  tool("set_booking_working_hours", "Replace a resource's weekly working hours. blocks: array of {weekday 0=Sun..6=Sat, start_time 'HH:MM', end_time 'HH:MM'}.",
    {
      resource_id: UUID,
      blocks: z.array(z.object({ weekday: z.number().int().min(0).max(6), start_time: z.string(), end_time: z.string() })),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      await t(ctx, "booking_working_hours").delete().eq("business_id", ctx.businessId).eq("resource_id", args.resource_id);
      if (args.blocks.length) {
        const rows = args.blocks.map((b: { weekday: number; start_time: string; end_time: string }) => ({
          business_id: ctx.businessId, resource_id: args.resource_id, weekday: b.weekday, start_time: b.start_time, end_time: b.end_time,
        }));
        const { error } = await t(ctx, "booking_working_hours").insert(rows);
        if (error) throw error;
      }
      return text({ updated: true, blocks: args.blocks.length });
    });

  tool("list_appointments", "List booked appointments. Optionally filter by ISO date range (from/to on starts_at) and status.",
    { from: z.string().optional(), to: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      let q = t(ctx, "appointments").select("*").eq("business_id", ctx.businessId).order("starts_at").limit(args.limit ?? 100);
      if (args.from) q = q.gte("starts_at", args.from);
      if (args.to) q = q.lte("starts_at", args.to);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("set_appointment_status", "Set an appointment's status (pending/confirmed/cancelled/rescheduled/completed/no_show).",
    { appointment_id: UUID, status: z.enum(["pending", "confirmed", "cancelled", "rescheduled", "completed", "no_show"]) },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const patch: Record<string, unknown> = { status: args.status };
      if (args.status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { data, error } = await t(ctx, "appointments").update(patch).eq("id", args.appointment_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, appointment: data });
    });

  tool("update_appointment_type", "Update a service. Only provided fields change. eligible_resource_ids restricts which resources can serve it (empty = any).",
    {
      appointment_type_id: UUID, name: z.string().optional(), duration_minutes: z.number().int().min(1).optional(),
      description: z.string().nullable().optional(), buffer_minutes: z.number().int().min(0).nullable().optional(),
      price_display: z.string().nullable().optional(), color: z.string().nullable().optional(),
      active: z.boolean().optional(), eligible_resource_ids: z.array(UUID).optional(), sort_order: z.number().int().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { appointment_type_id, ...rest } = args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const { data, error } = await t(ctx, "appointment_types").update(patch).eq("id", appointment_type_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, appointment_type: data });
    });

  tool("delete_appointment_type", "Delete a bookable service.",
    { appointment_type_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { error } = await t(ctx, "appointment_types").delete().eq("id", args.appointment_type_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("update_booking_resource", "Update a resource — rename, (de)activate, or link/unlink a team member (member_profile_id null = generic).",
    { resource_id: UUID, display_name: z.string().optional(), active: z.boolean().optional(), member_profile_id: UUID.nullable().optional(), sort_order: z.number().int().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { resource_id, ...rest } = args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const { data, error } = await t(ctx, "booking_resources").update(patch).eq("id", resource_id).eq("business_id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, resource: data });
    });

  tool("delete_booking_resource", "Delete a bookable resource.",
    { resource_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { error } = await t(ctx, "booking_resources").delete().eq("id", args.resource_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("delete_booking_form", "Delete a booking form.",
    { form_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { error } = await t(ctx, "booking_forms").delete().eq("id", args.form_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });

  tool("list_booking_exceptions", "List availability exceptions (blackout dates / custom hours).",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:read");
      const { data, error } = await t(ctx, "booking_availability_exceptions").select("*").eq("business_id", ctx.businessId).order("date");
      if (error) throw error;
      return text(data);
    });

  tool("create_booking_exception", "Add a blackout date (closed all day) or a custom-hours window. resource_id null = whole business.",
    {
      date: z.string(), is_closed: z.boolean().default(true), resource_id: UUID.nullable().optional(),
      start_time: z.string().optional(), end_time: z.string().optional(), reason: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { data, error } = await t(ctx, "booking_availability_exceptions").insert({
        business_id: ctx.businessId, date: args.date, is_closed: args.is_closed, resource_id: args.resource_id ?? null,
        start_time: args.is_closed ? null : args.start_time ?? null, end_time: args.is_closed ? null : args.end_time ?? null,
        reason: args.reason ?? null,
      }).select().single();
      if (error) throw error;
      return text({ created: true, exception: data });
    });

  tool("delete_booking_exception", "Remove an availability exception.",
    { exception_id: UUID },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "bookings:write");
      const { error } = await t(ctx, "booking_availability_exceptions").delete().eq("id", args.exception_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ deleted: true });
    });
}

/** Find or create the customer for a lead (mirrors ensureCustomerForLead in
 *  the web app). Returns the customer id, or null if the lead is missing. */
async function ensureCustomerForLead(ctx: McpContext, leadId: string): Promise<string | null> {
  const { data: lead } = await t(ctx, "leads").select("*").eq("id", leadId).eq("business_id", ctx.businessId).maybeSingle();
  if (!lead) return null;
  if (lead.customer_id) return lead.customer_id;
  const { data: customer, error } = await t(ctx, "customers").insert({
    business_id: ctx.businessId, user_id: ctx.userId, name: lead.name,
    email: lead.email ?? null, phone: lead.phone ?? null, city: lead.suburb ?? null,
    notes: lead.notes ?? null, archived: false,
  }).select("id").single();
  if (error) throw error;
  await t(ctx, "leads").update({ customer_id: customer.id }).eq("id", leadId).eq("business_id", ctx.businessId);
  return customer.id;
}
