"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/emails/invoice";
import { appUrl } from "@/lib/app-url";
import { randomBytes } from "node:crypto";
import type { Customer, Invoice, InvoiceWithCustomer, LineItem, Payment } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

export async function getInvoices(filters?: { status?: string; customer_id?: string }): Promise<InvoiceWithCustomer[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "invoices")
    .select("*, customers(id, name, email, company)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.customer_id) query = query.eq("customer_id", filters.customer_id);

  const { data, error } = await query;
  if (error) throw error;
  return data as InvoiceWithCustomer[];
}

export async function getInvoice(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: business } = await tbl(supabase, "businesses")
    .select("invoice_prefix, invoice_next_number")
    .eq("id", businessId)
    .single();

  const number = `${business?.invoice_prefix ?? "INV"}-${String(business?.invoice_next_number ?? 1).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ invoice_next_number: (business?.invoice_next_number ?? 1) + 1 })
    .eq("id", businessId);

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "invoices")
    .update(payload)
    .eq("id", id)
    .eq("business_id", businessId)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return data as Invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
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

  // Pull issuing prefix + counter
  const { data: business } = await tbl(supabase, "businesses")
    .select("invoice_prefix, invoice_next_number")
    .eq("id", businessId)
    .single();
  const number = `${business?.invoice_prefix ?? "INV"}-${String(business?.invoice_next_number ?? 1).padStart(4, "0")}`;
  await tbl(supabase, "businesses")
    .update({ invoice_next_number: (business?.invoice_next_number ?? 1) + 1 })
    .eq("id", businessId);

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: invoice } = await tbl(supabase, "invoices")
    .select("total, amount_paid")
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("Invoice not found");

  await tbl(supabase, "payments").insert({ ...payment, invoice_id: invoiceId, user_id: user.id, business_id: businessId });

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

  await tbl(supabase, "invoices").update({ amount_paid: newAmountPaid, status: newStatus }).eq("id", invoiceId);

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

      await tbl(supabase, "invoices")
        .update({ amount_paid: totalCollected, status: nextStatus })
        .eq("id", parentId);

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  const { data: invoices } = await tbl(supabase, "invoices")
    .select("id, number, total, amount_paid, status, issue_date, due_date, created_at, customers(name)")
    .eq("business_id", businessId);

  if (!invoices) return { totalRevenue: 0, outstanding: 0, overdue: 0, paidThisMonth: 0, recentInvoices: [], monthlyData: [] };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoices as any[];
  const totalRevenue = inv.filter((i) => i.status === "paid").reduce((sum: number, i) => sum + i.total, 0);
  const outstanding = inv.filter((i) => ["sent", "partial"].includes(i.status)).reduce((sum: number, i) => sum + (i.total - i.amount_paid), 0);
  const overdue = inv.filter((i) => ["sent", "partial"].includes(i.status) && new Date(i.due_date) < now).reduce((sum: number, i) => sum + (i.total - i.amount_paid), 0);
  const paidThisMonth = inv.filter((i) => i.status === "paid" && new Date(i.created_at) >= startOfMonth).reduce((sum: number, i) => sum + i.total, 0);

  const monthlyData: { month: string; revenue: number; invoiced: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = d.toLocaleString("default", { month: "short" });
    const monthInvoices = inv.filter((invoice) => {
      const created = new Date(invoice.created_at);
      return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
    });
    monthlyData.push({
      month: monthLabel,
      revenue: monthInvoices.filter((invoice) => invoice.status === "paid").reduce((s: number, invoice) => s + invoice.total, 0),
      invoiced: monthInvoices.reduce((s: number, invoice) => s + invoice.total, 0),
    });
  }

  const recentInvoices = inv.slice(0, 5);
  return { totalRevenue, outstanding, overdue, paidThisMonth, recentInvoices, monthlyData };
}

export async function sendInvoiceEmail(id: string, opts?: { recipients?: string[]; subject?: string }): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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

  // Mint/reuse a portal token so the customer can pay/view online
  const businessId = await getActiveBizId(supabase, user.id);
  let portalUrl: string | null = null;
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
    if (base && token) portalUrl = `${base}/portal/${token}/invoice/${invoiceData.id}`;
  }

  await sendEmail({
    to: recipients,
    subject: opts?.subject ?? `Invoice ${invoiceData.number} from ${businessData.name}`,
    html: invoiceEmailHtml({ invoice: invoiceData, customer, business: businessData, lineItems, portalUrl }),
    attachments: [{ filename: `${invoiceData.number}.pdf`, content: pdfBuffer }],
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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
