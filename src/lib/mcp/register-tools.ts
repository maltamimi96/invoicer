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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpServer = any;
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";
import { buildContext, assertScope, t, text, errorText, type McpContext } from "./context";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/emails/invoice";
import { quoteEmailHtml } from "@/lib/emails/quote";
import type { ApiScope, LineItem } from "@/types/database";

// ── helpers ────────────────────────────────────────────────────────────────

interface AuthExtra { businessId: string; userId: string; scopes: ApiScope[]; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctxFrom(extra: any): McpContext {
  const auth = extra?.authInfo?.extra as AuthExtra | undefined;
  if (!auth?.businessId) throw new Error("Unauthorized — no business context on the API key");
  return buildContext(auth);
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

/** Reuse or mint a 90-day portal token for a customer. */
async function getOrMintPortalToken(ctx: McpContext, customerId: string): Promise<string> {
  const { data: existing } = await t(ctx, "customer_portal_tokens")
    .select("token")
    .eq("business_id", ctx.businessId)
    .eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const token = "cust_" + randomBytes(24).toString("hex");
  await t(ctx, "customer_portal_tokens").insert({
    token, business_id: ctx.businessId, customer_id: customerId,
    created_by: ctx.userId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  return token;
}

const appBase = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.kireihq.com").replace(/\/$/, "");

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "must be a UUID");

// ── registration ─────────────────────────────────────────────────────────────

export function registerTools(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = (name: string, description: string, shape: z.ZodRawShape, handler: (args: any, extra: any) => Promise<unknown>) =>
    server.tool(name, description, shape, async (args: unknown, extra: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await handler(args as any, extra as any);
      } catch (e) {
        return errorText(e instanceof Error ? e.message : String(e));
      }
    });

  // ===== CUSTOMERS =====
  tool("list_customers", "List customers for the business. Optionally filter by a search term against name/email/company.",
    { search: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:read");
      let q = t(ctx, "customers").select("id, name, company, email, phone, address, city, postcode, archived")
        .eq("business_id", ctx.businessId).order("name").limit(args.limit ?? 50);
      if (args.search) q = q.or(`name.ilike.%${args.search}%,email.ilike.%${args.search}%,company.ilike.%${args.search}%`);
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
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "customers:write");
      const { data, error } = await t(ctx, "customers").insert({
        business_id: ctx.businessId, user_id: ctx.userId,
        name: args.name, email: args.email ?? null, phone: args.phone ?? null,
        company: args.company ?? null, address: args.address ?? null, city: args.city ?? null,
        postcode: args.postcode ?? null, notes: args.notes ?? null, archived: false,
      }).select().single();
      if (error) throw error;
      return text({ created: true, customer: data });
    });

  tool("update_customer", "Update fields on a customer. Only provided fields change.",
    {
      customer_id: UUID, name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      company: z.string().optional(), address: z.string().optional(), city: z.string().optional(),
      postcode: z.string().optional(), notes: z.string().optional(), archived: z.boolean().optional(),
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
      const { data: number, error: mintErr } = await ctx.sb.rpc("next_quote_number", { p_business_id: ctx.businessId });
      if (mintErr || !number) throw mintErr ?? new Error("Couldn't mint quote number");
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
      await sendEmail({
        to: recipients,
        subject: args.subject ?? `Quote ${quote.number} from ${business?.name ?? ""}`,
        html: quoteEmailHtml({ quote, customer, business, lineItems, acceptUrl, pdfUrl }),
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
      const { data: number, error: mintErr } = await ctx.sb.rpc("next_invoice_number", { p_business_id: ctx.businessId });
      if (mintErr || !number) throw mintErr ?? new Error("Couldn't mint invoice number");
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
      let portalUrl: string | null = null, pdfUrl: string | null = null;
      if (customer?.id) {
        const token = await getOrMintPortalToken(ctx, customer.id);
        portalUrl = `${appBase()}/portal/${token}/invoice/${invoice.id}`;
        pdfUrl = `${appBase()}/api/pdf/invoice/${invoice.id}?token=${token}`;
      }
      await sendEmail({
        to: recipients,
        subject: args.subject ?? `Invoice ${invoice.number} from ${business?.name ?? ""}`,
        html: invoiceEmailHtml({ invoice, customer, business, lineItems, portalUrl, pdfUrl }),
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
      const { data, error } = await ctx.sb.rpc("upsert_lead", {
        p_business_id: ctx.businessId, p_name: args.name, p_phone: args.phone ?? null, p_email: args.email ?? null,
        p_suburb: args.suburb ?? null, p_service: args.service ?? null, p_source: args.source ?? "manual",
        p_notes: args.notes ?? null,
      });
      if (error) {
        // Fall back to a plain insert if the RPC signature differs.
        const { data: ins, error: insErr } = await t(ctx, "leads").insert({
          business_id: ctx.businessId, name: args.name, phone: args.phone ?? null, email: args.email ?? null,
          suburb: args.suburb ?? null, service: args.service ?? null, source: args.source ?? "manual",
          notes: args.notes ?? null, status: "new",
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
        business_id: ctx.businessId, title: args.title, description: args.description ?? null,
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
        business_id: ctx.businessId, name: args.name, unit_price: args.unit_price,
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

  tool("update_settings", "Update business settings / preferences. Only provided fields change. Common fields: name, email, phone, address, currency, accent_color, sidebar_theme, bg_pattern, invoice_prefix, quote_prefix, bank_name, bank_account_number, bank_account_name, bank_sort_code, license_number.",
    {
      name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), address: z.string().optional(),
      currency: z.string().optional(), accent_color: z.string().optional(), sidebar_theme: z.string().optional(),
      bg_pattern: z.string().optional(), invoice_prefix: z.string().optional(), quote_prefix: z.string().optional(),
      bank_name: z.string().optional(), bank_account_number: z.string().optional(), bank_account_name: z.string().optional(),
      bank_sort_code: z.string().optional(), license_number: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "settings:write");
      const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length === 0) return errorText("No fields to update.");
      const { data, error } = await t(ctx, "businesses").update(clean).eq("id", ctx.businessId).select().single();
      if (error) throw error;
      return text({ updated: true, settings: data });
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
}
