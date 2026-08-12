"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { quoteEmailHtml, quoteEmailSubject } from "@/lib/emails/quote";
import { getResolvedEmailTemplate } from "@/lib/emails/templates";
import { randomBytes } from "node:crypto";
import type { Customer, Quote, QuoteWithCustomer, Invoice, LineItem } from "@/types/database";

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getQuotes(filters?: { status?: string; customer_id?: string; limit?: number }): Promise<QuoteWithCustomer[]> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Slim list columns — list pages don't need line_items/notes/terms; the
  // JSONB line_items is the dominant payload cost.
  let query = tbl(supabase, "quotes")
    .select(`
      id, user_id, number, status, customer_id,
      issue_date, expiry_date, total, invoice_id,
      created_at, updated_at,
      customers(id, name, email, company, lifecycle_stage)
    `)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw error;
  return data as QuoteWithCustomer[];
}

export async function getQuote(id: string) {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "quotes")
    .select("*, customers(*)")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as Quote & { customers: Customer | null };
}

export async function createQuote(payload: Omit<Quote, "id" | "created_at" | "updated_at" | "user_id" | "number">): Promise<Quote> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Atomic mint — one round-trip, race-safe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: number, error: mintErr } = await (supabase as any)
    .rpc("next_quote_number", { p_business_id: businessId });
  if (mintErr || !number) throw mintErr ?? new Error("Couldn't mint quote number");

  const { data, error } = await tbl(supabase, "quotes")
    .insert({ ...payload, user_id: user.id, business_id: businessId, number })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
  dispatchWebhook(businessId, "quote.created", data);
  return data as Quote;
}

export async function updateQuote(id: string, payload: Partial<Quote>): Promise<Quote> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "quotes")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return data as Quote;
}

export async function deleteQuote(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "quotes").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/quotes");
}

export async function duplicateQuote(id: string): Promise<Quote> {
  const quote = await getQuote(id);
  // Build the create payload explicitly so source id / number / timestamps
  // / invoice_id link don't carry over. createQuote mints fresh values.
  return createQuote({
    customer_id:    quote.customer_id,
    site_id:        quote.site_id,
    issue_date:     new Date().toISOString().split("T")[0],
    expiry_date:    quote.expiry_date,
    line_items:     quote.line_items,
    subtotal:       quote.subtotal,
    discount_type:  quote.discount_type,
    discount_value: quote.discount_value,
    discount_amount: quote.discount_amount,
    tax_total:      quote.tax_total,
    total:          quote.total,
    notes:          quote.notes,
    terms:          quote.terms,
    property_address: quote.property_address,
    status:         "draft",
    invoice_id:     null,
  } as unknown as Parameters<typeof createQuote>[0]);
}

export async function convertQuoteToInvoice(quoteId: string): Promise<Invoice> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: quote } = await tbl(supabase, "quotes").select("*").eq("id", quoteId).single();
  if (!quote) throw new Error("Quote not found");

  const { data: business } = await tbl(supabase, "businesses")
    .select("invoice_prefix, invoice_next_number")
    .eq("id", businessId)
    .single();

  const number = `${business?.invoice_prefix ?? "INV"}-${String(business?.invoice_next_number ?? 1).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ invoice_next_number: (business?.invoice_next_number ?? 1) + 1 })
    .eq("id", businessId);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const { data: invoice, error } = await tbl(supabase, "invoices")
    .insert({
      user_id: user.id,
      business_id: businessId,
      number,
      status: "draft",
      customer_id: quote.customer_id,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: dueDate.toISOString().split("T")[0],
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
      site_id: quote.site_id ?? null,
      property_address: quote.property_address ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  await tbl(supabase, "quotes").update({ invoice_id: invoice.id, status: "accepted" }).eq("id", quoteId);

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return invoice as Invoice;
}

export async function sendQuoteEmail(id: string, opts?: { recipients?: string[]; subject?: string; message?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const [quoteData, businessData] = await Promise.all([
    getQuote(id),
    (async () => {
      const businessId = await getActiveBizId(supabase, user.id);
      const { data } = await tbl(supabase, "businesses").select("*").eq("id", businessId).single();
      return data;
    })(),
  ]);

  const customer = quoteData.customers;
  const recipients = (opts?.recipients ?? (customer?.email ? [customer.email] : []))
    .map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error("No email recipients provided");

  const lineItems = (quoteData.line_items ?? []) as LineItem[];

  // Generate PDF buffer
  const { renderToStream } = await import("@react-pdf/renderer");
  const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
  const React = await import("react");
  const element = React.createElement(QuotePDFDocument, {
    quote: quoteData,
    customer,
    business: businessData,
    lineItems,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(element as any);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const pdfBuffer = Buffer.concat(chunks);

  // Issue (or reuse) a portal token so the customer can review & accept online,
  // plus a tokenised /api/pdf/quote link so they can re-download the PDF even
  // when email clients strip the attachment.
  const businessId = await getActiveBizId(supabase, user.id);
  let acceptUrl: string | null = null;
  let pdfUrl: string | null = null;
  if (customer?.id) {
    const { data: existing } = await tbl(supabase, "customer_portal_tokens")
      .select("token")
      .eq("business_id", businessId)
      .eq("customer_id", customer.id)
      .is("revoked_at", null)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .limit(1)
      .maybeSingle();
    let token: string | null = existing?.token ?? null;
    if (!token) {
      token = "cust_" + randomBytes(24).toString("hex");
      const expires_at = new Date(Date.now() + 90 * 86_400_000).toISOString();
      await tbl(supabase, "customer_portal_tokens").insert({
        token, business_id: businessId, customer_id: customer.id,
        created_by: user.id, expires_at,
      });
    }
    const base = appUrl();
    if (base && token) {
      acceptUrl = `${base}/portal/${token}/quote/${quoteData.id}`;
      pdfUrl    = `${base}/api/pdf/quote/${quoteData.id}?token=${token}`;
    }
  }

  const emailTemplate = await getResolvedEmailTemplate(supabase, businessId, "quote");

  await sendEmail({
    to: recipients,
    subject: opts?.subject ?? quoteEmailSubject({ quote: quoteData, customer, business: businessData }, emailTemplate),
    html: quoteEmailHtml({
    message: opts?.message ?? null, quote: quoteData, customer, business: businessData, lineItems, acceptUrl, pdfUrl, template: emailTemplate }),
    attachments: [{ filename: `${quoteData.number}.pdf`, content: pdfBuffer }],
    from: buildBusinessFrom({ name: businessData.name, localPart: "quotes" }),
    replyTo: businessData.email || undefined,
    tags: { business_id: businessId, doc_type: "quote", doc_id: quoteData.id },
  });

  // Mark as sent if still draft
  if (quoteData.status === "draft") {
    await tbl(supabase, "quotes")
      .update({ status: "sent" })
      .eq("id", id);
    revalidatePath(`/quotes/${id}`);
    dispatchWebhook(businessId, "quote.sent", { id, number: quoteData.number, customer_email: recipients.join(", ") });
  }
}

export async function sendQuoteSms(id: string, opts: { to: string; body?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);
  const quoteData = await getQuote(id);
  const customer = quoteData.customers;

  // Issue/reuse portal token + build accept URL
  let acceptUrl: string | null = null;
  if (customer?.id) {
    const { data: existing } = await tbl(supabase, "customer_portal_tokens")
      .select("token")
      .eq("business_id", businessId)
      .eq("customer_id", customer.id)
      .is("revoked_at", null)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .limit(1)
      .maybeSingle();
    let token: string | null = existing?.token ?? null;
    if (!token) {
      token = "cust_" + randomBytes(24).toString("hex");
      await tbl(supabase, "customer_portal_tokens").insert({
        token, business_id: businessId, customer_id: customer.id,
        created_by: user.id,
        expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      });
    }
    const base = appUrl();
    if (base && token) acceptUrl = `${base}/portal/${token}/quote/${quoteData.id}`;
  }

  const { data: business } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();
  let body = opts.body ?? `Hi${customer?.name ? " " + customer.name.split(" ")[0] : ""}, your quote ${quoteData.number} from ${business.name} is ready.`;

  // Always make sure the deep-link is in the SMS — append if the user
  // edited the body and removed it (or it was never there from the prefill).
  if (acceptUrl && !body.includes(acceptUrl)) {
    body = `${body.replace(/\s+$/, "")} ${acceptUrl}`;
  }

  const { sendSms } = await import("./sms");
  await sendSms({ to: opts.to, body, customerName: customer?.name ?? "Customer", customerId: customer?.id ?? null });

  if (quoteData.status === "draft") {
    await tbl(supabase, "quotes").update({ status: "sent" }).eq("id", id);
    revalidatePath(`/quotes/${id}`);
    dispatchWebhook(businessId, "quote.sent", { id, number: quoteData.number, channel: "sms", to: opts.to });
  }
}
