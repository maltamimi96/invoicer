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
  const { customers: _, payments: __, ...rest } = invoice;
  return createInvoice({ ...rest, status: "draft", amount_paid: 0 });
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

  const newAmountPaid = (invoice.amount_paid ?? 0) + payment.amount;
  const newStatus = newAmountPaid >= invoice.total ? "paid" : "partial";

  await tbl(supabase, "payments").insert({ ...payment, invoice_id: invoiceId, user_id: user.id, business_id: businessId });
  await tbl(supabase, "invoices").update({ amount_paid: newAmountPaid, status: newStatus }).eq("id", invoiceId);

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
    .select("total, amount_paid, status, due_date, created_at, number, customers(name)")
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

  const { data: business } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();
  const due = invoiceData.total - (invoiceData.amount_paid ?? 0);
  const body = opts.body ?? `Hi${customer?.name ? " " + customer.name.split(" ")[0] : ""}, invoice ${invoiceData.number} from ${business.name} is ready. Amount due: ${due.toFixed(2)}.`;

  const { sendSms } = await import("./sms");
  await sendSms({ to: opts.to, body, customerName: customer?.name ?? "Customer", customerId: customer?.id ?? null });

  if (invoiceData.status === "draft") {
    await tbl(supabase, "invoices").update({ status: "sent" }).eq("id", id);
    revalidatePath(`/invoices/${id}`);
    dispatchWebhook(businessId, "invoice.sent", { id, number: invoiceData.number, channel: "sms", to: opts.to });
  }
}
