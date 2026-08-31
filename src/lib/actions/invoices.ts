"use server";

import { revalidatePath } from "next/cache";
import { assertOk } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { markContactAsClient } from "@/lib/leads/promote";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { invoiceEmailHtml, invoiceEmailSubject } from "@/lib/emails/invoice";
import { getResolvedEmailTemplate } from "@/lib/emails/templates";
import { customerAllowsCard } from "@/lib/payment-methods";
import { settleInvoiceToPaid } from "@/lib/payments/settle";
import { appUrl } from "@/lib/app-url";
import { randomBytes } from "node:crypto";
import type { Customer, Invoice, InvoiceWithCustomer, LineItem, Payment } from "@/types/database";

import { getUser } from "@/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getInvoices(filters?: { status?: string; customer_id?: string; limit?: number }): Promise<InvoiceWithCustomer[]> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Slim list-view columns only — list pages don't need line_items/notes/terms
  // and pulling the JSONB line_items per row was the bulk of payload size.
  // Includes the columns the Invoice type declares minus the heavy ones.
  let query = tbl(supabase, "invoices")
    .select(`
      id, user_id, number, status, customer_id,
      issue_date, due_date, total, amount_paid,
      parent_invoice_id, created_at, updated_at,
      customers(id, name, email, company, lifecycle_stage)
    `)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw error;
  return data as InvoiceWithCustomer[];
}

export async function getInvoice(id: string) {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "invoices")
    .select("*, customers(*), payments(*)")
    .eq("id", id)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return data as Invoice & { customers: Customer | null; payments: Payment[]; line_items: LineItem[] };
}

export async function createInvoice(payload: Omit<Invoice, "id" | "created_at" | "updated_at" | "user_id" | "number">): Promise<Invoice> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Atomic mint: one round-trip, race-safe under concurrency.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: number, error: mintErr } = await (supabase as any)
    .rpc("next_invoice_number", { p_business_id: businessId });
  if (mintErr || !number) throw mintErr ?? new Error("Couldn't mint invoice number");

  const { data, error } = await tbl(supabase, "invoices")
    .insert({ ...payload, user_id: user.id, business_id: businessId, number })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  dispatchWebhook(businessId, "invoice.created", data);
  return data as Invoice;
}

export async function updateInvoice(id: string, payload: Partial<Invoice>): Promise<Invoice> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Marking an invoice "paid" via the status dropdown settles it through the
  // payments ledger rather than by writing amount_paid directly. Writing the
  // column left no ledger row behind, so the next real payment's recompute
  // un-paid the invoice and handed it to the dunning cron. settleInvoiceToPaid
  // writes the balancing entry, then derives amount_paid and status from it.
  // Only do this when the caller didn't pass an explicit amount_paid.
  const patch: Partial<Invoice> = { ...payload };
  if (payload.status === "paid" && payload.amount_paid != null) {
    // Setting the column directly alongside status:'paid' is exactly the defect
    // settleInvoiceToPaid exists to remove — it would write a balance with no
    // ledger row behind it, and the next real payment would un-pay the invoice.
    // No caller does this today; refuse rather than leave the hole open.
    throw new Error(
      "Set amount_paid by recording a payment (addPayment), not by marking an invoice paid.",
    );
  }
  if (payload.status === "paid") {
    await settleInvoiceToPaid((table) => tbl(supabase, table), {
      businessId,
      invoiceId: id,
      userId: user.id,
    });
    // settle() has already derived amount_paid from the ledger. The update
    // below still runs (it carries any other fields the caller passed, and
    // returns the row for revalidation), but it must not write amount_paid
    // back over the derived value. Re-writing status: 'paid' is a harmless
    // no-op.
    delete patch.amount_paid;
  }

  const { data, error } = await tbl(supabase, "invoices")
    .update(patch)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  // The parent (if any) is reconciled automatically by the DB trigger
  // trg_reconcile_parent_invoice — revalidate it too so the UI reflects it.
  if (data?.parent_invoice_id) revalidatePath(`/invoices/${data.parent_invoice_id}`);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return data as Invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  const { error } = await tbl(supabase, "invoices").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function duplicateInvoice(id: string): Promise<Invoice> {
  const invoice = await getInvoice(id);
  // Build the create payload explicitly so we never carry the source id /
  // number / timestamps / parent link through to the new row. createInvoice
  // mints fresh values for those.
  return createInvoice({
    customer_id:    invoice.customer_id,
    site_id:        invoice.site_id,
    issue_date:     new Date().toISOString().split("T")[0],
    due_date:       invoice.due_date,
    line_items:     invoice.line_items,
    subtotal:       invoice.subtotal,
    discount_type:  invoice.discount_type,
    discount_value: invoice.discount_value,
    discount_amount: invoice.discount_amount,
    tax_total:      invoice.tax_total,
    total:          invoice.total,
    notes:          invoice.notes,
    terms:          invoice.terms,
    property_address: invoice.property_address,
    status:         "draft",
    amount_paid:    0,
    parent_invoice_id: null,
  } as unknown as Parameters<typeof createInvoice>[0]);
}

/**
 * Get the children of a parent invoice (deposit + remainder + any other splits).
 */
export async function getChildInvoices(parentId: string): Promise<Invoice[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "invoices")
    .select("*")
    .eq("parent_invoice_id", parentId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Invoice[];
}

/**
 * Create a progress / deposit invoice that bills a portion of a parent invoice.
 * Inputs are flat scalars so this is callable from the AI agent layer.
 *
 * @param parent_invoice_id The full-job invoice this progress invoice bills against.
 * @param amount             Absolute currency amount to bill now. Mutually exclusive with `percent`.
 * @param percent            Percentage of the parent total (0-100). Mutually exclusive with `amount`.
 * @param description        Line-item description, e.g. "30% deposit" or "Final balance".
 * @param due_date           ISO date for the new invoice's due date. Defaults to parent's due_date.
 */
export async function createProgressInvoice(input: {
  parent_invoice_id: string;
  amount?: number;
  percent?: number;
  description?: string;
  due_date?: string;
}): Promise<Invoice> {
  if (!input.parent_invoice_id) throw new Error("parent_invoice_id is required");
  if ((input.amount == null) === (input.percent == null)) {
    throw new Error("Provide exactly one of `amount` or `percent`");
  }

  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Pull parent + existing children to compute remaining
  const { data: parent, error: pErr } = await tbl(supabase, "invoices")
    .select("*")
    .eq("id", input.parent_invoice_id)
    .eq("business_id", businessId)
    .single();
  if (pErr || !parent) throw new Error(pErr?.message ?? "Parent invoice not found");

  const { data: childrenRaw } = await tbl(supabase, "invoices")
    .select("total")
    .eq("parent_invoice_id", parent.id)
    .eq("business_id", businessId);
  const billedSoFar = ((childrenRaw ?? []) as { total: number }[])
    .reduce((sum, c) => sum + Number(c.total ?? 0), 0);
  const remaining = Math.max(0, Number(parent.total) - billedSoFar);

  // Resolve the requested amount
  let amount = input.amount;
  if (input.percent != null) {
    if (input.percent < 0 || input.percent > 100) throw new Error("percent must be between 0 and 100");
    amount = Math.round((Number(parent.total) * input.percent) / 100 * 100) / 100;
  }
  amount = Math.round((amount ?? 0) * 100) / 100;
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  if (amount > remaining + 0.01) {
    throw new Error(`Amount exceeds remaining balance (${remaining.toFixed(2)} left on ${parent.number})`);
  }

  // Build a description: "30% deposit on INV-0042" or user-provided
  const inferredPercent = Math.round((amount / Number(parent.total)) * 100);
  const description = (input.description?.trim()) || (
    Math.abs(amount - remaining) < 0.01
      ? `Final balance for ${parent.number}`
      : `${inferredPercent}% progress payment on ${parent.number}`
  );

  // Atomic mint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: number, error: mintErr } = await (supabase as any)
    .rpc("next_invoice_number", { p_business_id: businessId });
  if (mintErr || !number) throw mintErr ?? new Error("Couldn't mint invoice number");

  const today = new Date().toISOString().split("T")[0];

  // Coerce PostgREST numeric-as-string and copy parent's line items verbatim so
  // the customer can see exactly what they're paying a deposit *toward*. Then
  // append a single balance-reduction line that brings the total down to the
  // requested deposit amount. Keeps math transparent and avoids NaN.
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };
  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `li_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const parentLineItems = (Array.isArray(parent.line_items) ? parent.line_items : []) as Partial<LineItem>[];
  const cleanedParentItems: LineItem[] = parentLineItems.map((li) => {
    const quantity   = num(li.quantity);
    const unit_price = num(li.unit_price);
    const liSubtotal = num(li.subtotal ?? quantity * unit_price);
    const liTotal    = num(li.total ?? liSubtotal);
    return {
      id: li.id ?? newId(),
      product_id: li.product_id,
      name: li.name ?? li.description ?? "Item",
      description: li.description ?? "",
      quantity,
      unit_price,
      tax_rate: num(li.tax_rate),
      discount_percent: num(li.discount_percent),
      subtotal: liSubtotal,
      tax_amount: num(li.tax_amount),
      total: liTotal,
    };
  });

  const parentTotalNum = num(parent.total);
  const balance = Math.round((parentTotalNum - amount) * 100) / 100;

  const lineItems: LineItem[] = [...cleanedParentItems];
  if (balance > 0) {
    lineItems.push({
      id: newId(),
      name: "Balance due on completion",
      description: `Remainder of ${parent.number} payable on completion of works`,
      quantity: 1,
      unit_price: -balance,
      tax_rate: 0,
      discount_percent: 0,
      subtotal: -balance,
      tax_amount: 0,
      total: -balance,
    });
  }

  // Subtotal sums the line items (including the negative balance line) so it
  // matches `total` exactly — no tax/discount needed on the deposit invoice.
  const subtotal = Math.round(lineItems.reduce((s, li) => s + num(li.total), 0) * 100) / 100;

  // Stash the deposit framing in notes so the PDF's notes block calls it out.
  const depositNote = description;
  const mergedNotes = parent.notes ? `${depositNote}\n\n${parent.notes}` : depositNote;

  const { data, error } = await tbl(supabase, "invoices")
    .insert({
      user_id: user.id,
      business_id: businessId,
      number,
      status: "draft",
      customer_id: parent.customer_id,
      issue_date: today,
      due_date: input.due_date ?? parent.due_date ?? today,
      line_items: lineItems,
      subtotal,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_total: 0,
      total: amount,
      amount_paid: 0,
      notes: mergedNotes,
      terms: parent.terms ?? null,
      site_id: parent.site_id ?? null,
      property_address: parent.property_address ?? null,
      parent_invoice_id: parent.id,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${parent.id}`);
  revalidatePath(`/invoices/${data.id}`);
  revalidatePath("/dashboard");
  dispatchWebhook(businessId, "invoice.created", data);
  return data as Invoice;
}

export async function addPayment(invoiceId: string, payment: { amount: number; date: string; method?: string; reference?: string; notes?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Validate before touching the database. Nothing else did: a NaN from a bad
  // parseFloat, or a negative amount, would be written straight through and
  // then folded into amount_paid.
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be a positive number.");
  }

  const { data: invoice } = await tbl(supabase, "invoices")
    .select("total, amount_paid, customer_id")
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("Invoice not found");

  // This insert used to be fired without destructuring, so a rejected write —
  // RLS denial, CHECK violation, bad date — returned normally. The recompute
  // below then read the payments table (unchanged), wrote the SAME amount_paid
  // back, and the UI said "Payment recorded". The user believed money had been
  // recorded against an invoice that had nothing written to it.
  assertOk(
    await tbl(supabase, "payments").insert({
      ...payment, amount, invoice_id: invoiceId, user_id: user.id, business_id: businessId,
    }),
    "record the payment",
  );

  // A manually recorded payment is money arriving too: if this contact was
  // still a lead, they have now bought something and are a client.
  await markContactAsClient(supabase, businessId, invoice.customer_id);

  // Recompute this invoice's amount_paid from truth (payments table + any
  // children's collections if it's a parent of a progress-billed job). This
  // handles direct-payment-on-parent-with-children correctly without
  // double-counting prior rollups stored in amount_paid.
  const { data: directPayments } = await tbl(supabase, "payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .eq("business_id", businessId);
  const directSum = ((directPayments ?? []) as { amount: unknown }[])
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const { data: childCollections } = await tbl(supabase, "invoices")
    .select("amount_paid")
    .eq("parent_invoice_id", invoiceId)
    .eq("business_id", businessId);
  const childSum = ((childCollections ?? []) as { amount_paid: unknown }[])
    .reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);
  const newAmountPaid = directSum + childSum;
  const newStatus = newAmountPaid >= invoice.total - 0.01 ? "paid" : "partial";

  // Also unchecked before: a failed rollup left the payment row written but
  // amount_paid stale, so the invoice under-reported what had been collected.
  assertOk(
    await tbl(supabase, "invoices")
      .update({ amount_paid: newAmountPaid, status: newStatus })
      .eq("id", invoiceId),
    "update the invoice balance",
  );

  // If this invoice is a child of a progress-billed parent, roll the new
  // payment up so the parent reflects everything collected toward the job.
  // The parent's amount_paid is recomputed as: sum of direct payments against
  // the parent + sum of amount_paid across all child invoices. Idempotent —
  // safe to call repeatedly, no double-counting.
  const { data: childRow } = await tbl(supabase, "invoices")
    .select("parent_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  const parentId = childRow?.parent_invoice_id as string | null;
  if (parentId) {
    const [{ data: siblings }, { data: parentDirectPayments }, { data: parentRow }] = await Promise.all([
      tbl(supabase, "invoices")
        .select("amount_paid")
        .eq("parent_invoice_id", parentId)
        .eq("business_id", businessId),
      tbl(supabase, "payments")
        .select("amount")
        .eq("invoice_id", parentId)
        .eq("business_id", businessId),
      tbl(supabase, "invoices")
        .select("total, status")
        .eq("id", parentId)
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);
    if (parentRow) {
      const collectedFromChildren = ((siblings ?? []) as { amount_paid: unknown }[])
        .reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);
      const parentDirect = ((parentDirectPayments ?? []) as { amount: unknown }[])
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const totalCollected = parentDirect + collectedFromChildren;
      const parentTotal    = Number(parentRow.total ?? 0);
      const fullyCovered   = totalCollected >= parentTotal - 0.01;

      // Decide the parent's new status. Don't fight cancelled or draft.
      const currentStatus = parentRow.status as string;
      let nextStatus = currentStatus;
      if (currentStatus !== "cancelled" && currentStatus !== "draft") {
        if (fullyCovered)               nextStatus = "paid";
        else if (totalCollected > 0.01) nextStatus = "partial";
      }

      assertOk(
        await tbl(supabase, "invoices")
          .update({ amount_paid: totalCollected, status: nextStatus })
          .eq("id", parentId),
        "roll the payment up to the parent invoice",
      );

      if (nextStatus === "paid" && currentStatus !== "paid") {
        dispatchWebhook(businessId, "invoice.paid", { id: parentId, total: parentTotal, via_progress: true });
      }
      revalidatePath(`/invoices/${parentId}`);
    }
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  dispatchWebhook(businessId, "payment.received", { invoice_id: invoiceId, amount: payment.amount, new_status: newStatus });
  if (newStatus === "paid") {
    dispatchWebhook(businessId, "invoice.paid", { id: invoiceId, total: invoice.total });
  }
}

export async function getPayments(invoiceId: string): Promise<Payment[]> {
  const supabase = await createClient();
  const { data, error } = await tbl(supabase, "payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data as Payment[];
}

export async function getDashboardStats() {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);

  // Single SQL aggregate (migration 20260716130000_dashboard_stats_rpc) —
  // replaces fetching EVERY invoice row into Node and reducing in JS. Same
  // return shape; SECURITY INVOKER so RLS applies exactly as before (workers
  // get an empty result, not an error).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("dashboard_stats", { biz: businessId });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return {
    totalRevenue: Number(d.totalRevenue ?? 0),
    outstanding: Number(d.outstanding ?? 0),
    overdue: Number(d.overdue ?? 0),
    paidThisMonth: Number(d.paidThisMonth ?? 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentInvoices: ((d.recentInvoices ?? []) as any[]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monthlyData: ((d.monthlyData ?? []) as any[]).map((m) => ({
      month: String(m.month), revenue: Number(m.revenue ?? 0), invoiced: Number(m.invoiced ?? 0),
    })),
  };
}

export async function sendInvoiceEmail(id: string, opts?: { recipients?: string[]; subject?: string; message?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const [invoiceData, businessData] = await Promise.all([
    getInvoice(id),
    (async () => {
      const businessId = await getActiveBizId(supabase, user.id);
      const { data } = await tbl(supabase, "businesses").select("*").eq("id", businessId).single();
      return data;
    })(),
  ]);

  const customer = invoiceData.customers;
  const recipients = (opts?.recipients ?? (customer?.email ? [customer.email] : []))
    .map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error("No email recipients provided");

  const lineItems = (invoiceData.line_items ?? []) as LineItem[];

  // Autopay — if the customer saved a card for automatic payments, charge it
  // off-session now and skip the manual pay-request email (the charge path
  // sends a receipt). Falls through to the normal email when the card needs
  // authentication or is declined, so they can still pay via the link.
  if (customer?.id && businessData?.stripe_charges_enabled) {
    const { data: cust } = await tbl(supabase, "customers")
      .select("autopay_enabled, stripe_payment_method_id").eq("id", customer.id).maybeSingle();
    const balance = Number(invoiceData.total) - Number(invoiceData.amount_paid ?? 0);
    if (cust?.autopay_enabled && cust?.stripe_payment_method_id && balance > 0.01) {
      if (invoiceData.status === "draft") {
        await tbl(supabase, "invoices").update({ status: "sent" }).eq("id", id);
      }
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { chargeInvoiceToSavedCard } = await import("@/lib/stripe-charge");
      const res = await chargeInvoiceToSavedCard(createAdminClient(), id, businessData.id);
      if (res.ok) {
        revalidatePath(`/invoices/${id}`); revalidatePath("/invoices");
        return; // charged off-session; receipt already emailed by the charge path
      }
      // else: fall through and email the invoice + pay link for manual payment
    }
  }

  // Generate PDF buffer
  const { renderToStream } = await import("@react-pdf/renderer");
  const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
  const React = await import("react");
  const element = React.createElement(InvoicePDFDocument, {
    invoice: invoiceData,
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

  // Mint/reuse a portal token so the customer can pay/view online + tokenised
  // /api/pdf/invoice link so they can re-download even when email clients strip
  // the attachment.
  const businessId = await getActiveBizId(supabase, user.id);
  let portalUrl: string | null = null;
  let pdfUrl: string | null = null;
  let payUrl: string | null = null;
  let revolutPayUrl: string | null = null;
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
    if (base && token) {
      portalUrl = `${base}/portal/${token}/invoice/${invoiceData.id}`;
      pdfUrl    = `${base}/api/pdf/invoice/${invoiceData.id}?token=${token}`;
      // Card-pay link only when the business has Stripe charges enabled and the
      // invoice still has a balance to collect.
      const balance = Number(invoiceData.total) - Number(invoiceData.amount_paid ?? 0);
      if (businessData.stripe_charges_enabled && balance > 0.01 && customerAllowsCard(customer?.allowed_payment_methods)) {
        payUrl = `${base}/api/stripe/checkout?invoice=${invoiceData.id}&token=${token}`;
      }
      // Revolut pay link — independent of Stripe (works when Stripe isn't set up).
      if (businessData.revolut_enabled && balance > 0.01 && customerAllowsCard(customer?.allowed_payment_methods)) {
        revolutPayUrl = `${base}/api/revolut/checkout?invoice=${invoiceData.id}&token=${token}`;
      }
    }
  }

  const emailTemplate = await getResolvedEmailTemplate(supabase, businessId, "invoice");

  await sendEmail({
    to: recipients,
    subject: opts?.subject ?? invoiceEmailSubject({ invoice: invoiceData, customer, business: businessData }, emailTemplate),
    html: invoiceEmailHtml({
    message: opts?.message ?? null, invoice: invoiceData, customer, business: businessData, lineItems, portalUrl, pdfUrl, payUrl, revolutPayUrl, template: emailTemplate }),
    attachments: [{ filename: `${invoiceData.number}.pdf`, content: pdfBuffer }],
    from: buildBusinessFrom({ name: businessData.name, localPart: "invoices" }),
    replyTo: businessData.email || undefined,
    tags: { business_id: businessId, doc_type: "invoice", doc_id: invoiceData.id },
  });

  // Mark as sent if still draft
  if (invoiceData.status === "draft") {
    await tbl(supabase, "invoices")
      .update({ status: "sent" })
      .eq("id", id);
    revalidatePath(`/invoices/${id}`);
    dispatchWebhook(businessId, "invoice.sent", { id, number: invoiceData.number, customer_email: recipients.join(", ") });
  }
}

export async function sendInvoiceSms(id: string, opts: { to: string; body?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();

  const businessId = await getActiveBizId(supabase, user.id);
  const invoiceData = await getInvoice(id);
  const customer = invoiceData.customers;

  // Issue/reuse a portal token so the customer can deep-link to this invoice
  // from the SMS — same flow as the quote SMS path.
  let payUrl: string | null = null;
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
    if (base && token) payUrl = `${base}/portal/${token}/invoice/${invoiceData.id}`;
  }

  const { data: business } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();
  const due = invoiceData.total - (invoiceData.amount_paid ?? 0);
  const firstName = customer?.name ? " " + customer.name.split(" ")[0] : "";
  let body = opts.body ?? `Hi${firstName}, invoice ${invoiceData.number} from ${business.name} is ready. Amount due: ${due.toFixed(2)}.`;

  // Always make sure the deep-link is in the SMS — append if the user
  // edited the body and removed it (or it was never there from the prefill).
  if (payUrl && !body.includes(payUrl)) {
    body = `${body.replace(/\s+$/, "")} ${payUrl}`;
  }

  const { sendSms } = await import("./sms");
  await sendSms({ to: opts.to, body, customerName: customer?.name ?? "Customer", customerId: customer?.id ?? null });

  if (invoiceData.status === "draft") {
    await tbl(supabase, "invoices").update({ status: "sent" }).eq("id", id);
    revalidatePath(`/invoices/${id}`);
    dispatchWebhook(businessId, "invoice.sent", { id, number: invoiceData.number, channel: "sms", to: opts.to });
  }
}
