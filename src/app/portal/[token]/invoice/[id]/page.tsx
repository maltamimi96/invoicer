import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, FileText, Download } from "@/components/ui/icons";
import type { LineItem } from "@/types/database";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function PortalInvoicePage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const [{ data: invoice }, { data: business }, { data: customer }, { data: payments }] = await Promise.all([
    tbl(sb, "invoices")
      .select("*")
      .eq("id", id)
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, currency").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "customers").select("name, company, email, billing_address").eq("id", link.customer_id).maybeSingle(),
    tbl(sb, "payments")
      .select("amount, date, method, reference")
      .eq("invoice_id", id)
      .order("date", { ascending: false }),
  ]);

  if (!invoice) notFound();

  const currency = business?.currency || "GBP";
  const lineItems: LineItem[] = invoice.line_items || [];
  const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
  const isPaid = invoice.status === "paid" || balance < 0.01;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href={`/portal/${token}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          {business?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} className="w-8 h-8 rounded object-contain" />
          ) : (
            <span className="text-sm font-semibold">{business?.name}</span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">Invoice #{invoice.number}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              From {business?.name} · Issued {formatDate(invoice.issue_date)} · Due {formatDate(invoice.due_date)}
            </p>
          </div>
          <StatusBadge status={isPaid ? "paid" : invoice.status} />
        </div>

        {/* Customer */}
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Billed to</p>
          <p className="font-medium mt-1">{customer?.name}</p>
          {customer?.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
          {customer?.billing_address && (
            <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">{customer.billing_address}</p>
          )}
        </Card>

        {/* Line items */}
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Item</th>
                <th className="text-right px-4 py-3 font-semibold w-16">Qty</th>
                <th className="text-right px-4 py-3 font-semibold w-28">Unit</th>
                <th className="text-right px-4 py-3 font-semibold w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id} className="border-t border-border/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{li.name}</p>
                    {li.description && <p className="text-xs text-muted-foreground mt-0.5">{li.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">{li.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(li.unit_price, currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(li.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Totals */}
        <div className="flex justify-end">
          <Card className="p-5 w-full max-w-xs space-y-1">
            <Row label="Subtotal" value={formatCurrency(invoice.subtotal, currency)} />
            {invoice.discount_amount > 0 && <Row label="Discount" value={`-${formatCurrency(invoice.discount_amount, currency)}`} />}
            {invoice.tax_total > 0 && <Row label="Tax" value={formatCurrency(invoice.tax_total, currency)} />}
            <div className="border-t border-border my-2" />
            <Row label="Total" value={formatCurrency(invoice.total, currency)} bold />
            {Number(invoice.amount_paid ?? 0) > 0 && (
              <>
                <Row label="Paid" value={`-${formatCurrency(Number(invoice.amount_paid), currency)}`} />
                <div className="border-t border-border my-2" />
                <Row label="Balance due" value={formatCurrency(balance, currency)} bold />
              </>
            )}
          </Card>
        </div>

        {/* Payment history */}
        {payments && payments.length > 0 && (
          <Card className="p-5 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Payment history</p>
            <ul className="text-sm divide-y divide-border/50">
              {payments.map((p: { amount: number; date: string; method?: string | null; reference?: string | null }, i: number) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {formatDate(p.date)}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="font-medium">{formatCurrency(p.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Notes / terms */}
        {(invoice.notes || invoice.terms) && (
          <Card className="p-5 space-y-3">
            {invoice.notes && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notes</p>
                <p className="text-sm mt-1 whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Terms</p>
                <p className="text-sm mt-1 whitespace-pre-line">{invoice.terms}</p>
              </div>
            )}
          </Card>
        )}

        {/* Actions */}
        <Card className={`p-6 text-center space-y-3 ${
          isPaid
            ? "border-emerald-500/30 bg-emerald-500/5"
            : balance > 0 ? "border-primary/30 bg-primary/5" : ""
        }`}>
          {isPaid ? (
            <>
              <p className="font-medium text-emerald-600 dark:text-emerald-400">✓ Paid in full</p>
              <p className="text-xs text-muted-foreground">Thanks for your payment.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Balance due: {formatCurrency(balance, currency)}</p>
              <p className="text-xs text-muted-foreground">
                Have questions? Reply to the email this invoice arrived in.
              </p>
            </>
          )}
          <a
            href={`/api/pdf/invoice/${invoice.id}?token=${token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </a>
        </Card>

        <footer className="text-center text-xs text-muted-foreground py-6 border-t">
          Powered by Invoicer
        </footer>
      </main>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:     "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    sent:     "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    overdue:  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    partial:  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    draft:    "bg-muted text-muted-foreground",
    cancelled:"bg-muted text-muted-foreground",
  };
  return <Badge variant="secondary" className={map[status] || "bg-muted"}>{status}</Badge>;
}
