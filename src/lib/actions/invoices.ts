"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/emails/invoice";
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

export async function sendInvoiceEmail(id: string): Promise<void> {
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
  if (!customer?.email) throw new Error("Customer has no email address");

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

  await sendEmail({
    to: customer.email,
    subject: `Invoice ${invoiceData.number} from ${businessData.name}`,
    html: invoiceEmailHtml({ invoice: invoiceData, customer, business: businessData, lineItems }),
    attachments: [{ filename: `${invoiceData.number}.pdf`, content: pdfBuffer }],
  });

  // Mark as sent if still draft
  if (invoiceData.status === "draft") {
    await tbl(supabase, "invoices")
      .update({ status: "sent" })
      .eq("id", id);
    revalidatePath(`/invoices/${id}`);
  }
}
