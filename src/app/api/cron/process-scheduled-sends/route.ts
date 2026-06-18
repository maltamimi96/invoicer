/**
 * GET /api/cron/process-scheduled-sends
 *
 * Runs every minute via Vercel Cron. Pulls pending scheduled_sends rows whose
 * send_at has passed, locks each by flipping status to 'sending', then
 * dispatches the email/SMS using the admin Supabase client (cron has no user
 * session). Re-renders the PDF and rolls a portal token the same way the
 * authenticated send paths do.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { sendSms } from "@/lib/actions/sms";
import { invoiceEmailHtml, invoiceEmailSubject } from "@/lib/emails/invoice";
import { quoteEmailHtml, quoteEmailSubject } from "@/lib/emails/quote";
import { getResolvedEmailTemplate } from "@/lib/emails/templates";
import { appUrl } from "@/lib/app-url";
import type { LineItem } from "@/types/database";

export const maxDuration = 60;

interface Row {
  id: string;
  business_id: string;
  doc_type: "invoice" | "quote";
  doc_id: string;
  channel: "email" | "sms";
  recipients: string[] | null;
  to_phone: string | null;
  subject: string | null;
  body: string | null;
  attempt_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function getOrMintPortalToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  customerId: string,
): Promise<string | null> {
  const { data: existing } = await tbl(sb, "customer_portal_tokens")
    .select("token")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token as string;

  const token = "cust_" + randomBytes(24).toString("hex");
  await tbl(sb, "customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  return token;
}

async function dispatchInvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  row: Row,
): Promise<void> {
  const { data: invoice } = await tbl(sb, "invoices")
    .select("*, customers(*)")
    .eq("id", row.doc_id)
    .eq("business_id", row.business_id)
    .single();
  if (!invoice) throw new Error("Invoice not found");
  const { data: business } = await tbl(sb, "businesses").select("*").eq("id", row.business_id).single();

  if (row.channel === "email") {
    const recipients = (row.recipients ?? (invoice.customers?.email ? [invoice.customers.email] : []))
      .map((e: string) => e.trim()).filter(Boolean);
    if (recipients.length === 0) throw new Error("No email recipients");

    const lineItems = (invoice.line_items ?? []) as LineItem[];

    // Render PDF
    const { renderToStream } = await import("@react-pdf/renderer");
    const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
    const React = await import("react");
    const element = React.createElement(InvoicePDFDocument, { invoice, customer: invoice.customers, business, lineItems });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    let portalUrl: string | null = null;
    let payUrl: string | null = null;
    if (invoice.customers?.id) {
      const token = await getOrMintPortalToken(sb, row.business_id, invoice.customers.id);
      const base = appUrl();
      if (base && token) {
        portalUrl = `${base}/portal/${token}/invoice/${invoice.id}`;
        const balance = Number(invoice.total) - Number(invoice.amount_paid ?? 0);
        if (business?.stripe_charges_enabled && balance > 0.01) {
          payUrl = `${base}/api/stripe/checkout?invoice=${invoice.id}&token=${token}`;
        }
      }
    }

    const emailTemplate = await getResolvedEmailTemplate(sb, row.business_id, "invoice");

    await sendEmail({
      to: recipients,
      subject: row.subject ?? invoiceEmailSubject({ invoice, customer: invoice.customers, business }, emailTemplate),
      html: invoiceEmailHtml({ invoice, customer: invoice.customers, business, lineItems, portalUrl, payUrl, template: emailTemplate }),
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdfBuffer }],
      from: business?.name ? buildBusinessFrom({ name: business.name, localPart: "invoices" }) : undefined,
      replyTo: business?.email || undefined,
      tags: { business_id: row.business_id, doc_type: "invoice", doc_id: invoice.id },
    });

    if (invoice.status === "draft") {
      await tbl(sb, "invoices").update({ status: "sent" }).eq("id", invoice.id);
    }
  } else {
    if (!row.to_phone) throw new Error("No phone for SMS");
    await sendSms({
      to: row.to_phone,
      body: row.body ?? `Invoice ${invoice.number} is ready.`,
      customerName: invoice.customers?.name ?? "Customer",
      customerId: invoice.customers?.id ?? null,
    });
  }
}

async function dispatchQuote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  row: Row,
): Promise<void> {
  const { data: quote } = await tbl(sb, "quotes")
    .select("*, customers(*)")
    .eq("id", row.doc_id)
    .eq("business_id", row.business_id)
    .single();
  if (!quote) throw new Error("Quote not found");
  const { data: business } = await tbl(sb, "businesses").select("*").eq("id", row.business_id).single();

  if (row.channel === "email") {
    const recipients = (row.recipients ?? (quote.customers?.email ? [quote.customers.email] : []))
      .map((e: string) => e.trim()).filter(Boolean);
    if (recipients.length === 0) throw new Error("No email recipients");

    const lineItems = (quote.line_items ?? []) as LineItem[];

    const { renderToStream } = await import("@react-pdf/renderer");
    const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
    const React = await import("react");
    const element = React.createElement(QuotePDFDocument, { quote, customer: quote.customers, business, lineItems });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    let acceptUrl: string | null = null;
    if (quote.customers?.id) {
      const token = await getOrMintPortalToken(sb, row.business_id, quote.customers.id);
      const base = appUrl();
      if (base && token) acceptUrl = `${base}/portal/${token}/quote/${quote.id}`;
    }

    const emailTemplate = await getResolvedEmailTemplate(sb, row.business_id, "quote");

    await sendEmail({
      to: recipients,
      subject: row.subject ?? quoteEmailSubject({ quote, customer: quote.customers, business }, emailTemplate),
      html: quoteEmailHtml({ quote, customer: quote.customers, business, lineItems, acceptUrl, template: emailTemplate }),
      attachments: [{ filename: `${quote.number}.pdf`, content: pdfBuffer }],
      from: business?.name ? buildBusinessFrom({ name: business.name, localPart: "quotes" }) : undefined,
      replyTo: business?.email || undefined,
      tags: { business_id: row.business_id, doc_type: "quote", doc_id: quote.id },
    });

    if (quote.status === "draft") {
      await tbl(sb, "quotes").update({ status: "sent" }).eq("id", quote.id);
    }
  } else {
    if (!row.to_phone) throw new Error("No phone for SMS");
    await sendSms({
      to: row.to_phone,
      body: row.body ?? `Quote ${quote.number} is ready.`,
      customerName: quote.customers?.name ?? "Customer",
      customerId: quote.customers?.id ?? null,
    });
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: due } = await (sb as any)
    .from("scheduled_sends")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(50);

  const rows = (due ?? []) as Row[];
  const results: { id: string; status: "sent" | "failed"; error?: string }[] = [];

  for (const row of rows) {
    // Optimistic claim — only flip pending → sending. If something else
    // already grabbed it (concurrent worker, manual cancel), skip silently.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claim } = await (sb as any)
      .from("scheduled_sends")
      .update({ status: "sending", attempt_count: row.attempt_count + 1, updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claim) continue;

    try {
      if (row.doc_type === "invoice") await dispatchInvoice(sb, row);
      else                            await dispatchQuote(sb, row);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("scheduled_sends")
        .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, status: "sent" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("scheduled_sends")
        .update({ status: "failed", last_error: msg, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
