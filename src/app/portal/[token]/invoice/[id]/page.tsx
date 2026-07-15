import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, FileText, Download, CreditCard } from "@/components/ui/icons";
import { resolveOfferedMethods } from "@/lib/payment-methods";
import { computeSurcharge, surchargeNote } from "@/lib/stripe";
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
    tbl(sb, "businesses").select("name, logo_url, currency, bank_name, bank_account_name, bank_account_number, bank_sort_code, bank_iban, phone, email, stripe_charges_enabled, card_surcharge_enabled, card_surcharge_percent, card_surcharge_fixed, card_surcharge_note").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "customers").select("name, company, email, phone, address, city, postcode, country, allowed_payment_methods, autopay_enabled, stripe_payment_method_id, stripe_pm_brand, stripe_pm_last4").eq("id", link.customer_id).maybeSingle(),
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

  // Which payment methods this customer may use (per-customer allow-list).
  const hasBankDetails = !!(business?.bank_account_name || business?.bank_account_number || business?.bank_iban);
  const offered = resolveOfferedMethods({
    allowed: customer?.allowed_payment_methods,
    stripeEnabled: !!business?.stripe_charges_enabled,
    hasBankDetails,
  });

  // Optional card surcharge passed to the customer.
  const surcharge = computeSurcharge(balance, {
    enabled: business?.card_surcharge_enabled,
    percent: business?.card_surcharge_percent,
    fixed: business?.card_surcharge_fixed,
  });
  const cardNote = surchargeNote({
    enabled: business?.card_surcharge_enabled,
    percent: business?.card_surcharge_percent,
    fixed: business?.card_surcharge_fixed,
    note: business?.card_surcharge_note,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link href={`/portal/${token}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-3">
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={business.logo_url} alt={business.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-contain bg-white border border-border p-1" />
            ) : null}
            <div className="text-right">
              <p className="font-semibold text-sm">{business?.name}</p>
              {business?.phone && <p className="text-xs text-muted-foreground">{business.phone}</p>}
            </div>
          </div>
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
          <p className="text-lg font-semibold mt-1">{customer?.name}</p>
          {customer?.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
          {(customer?.address || customer?.city) && (
            <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
              {[customer.address, [customer.city, customer.postcode].filter(Boolean).join(" "), customer.country].filter(Boolean).join("\n")}
            </p>
          )}
          {customer?.email && <p className="text-sm text-muted-foreground mt-1">{customer.email}</p>}
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

        {/* How to pay — bank transfer details */}
        {!isPaid && balance > 0 && offered.bank_transfer && (
          <Card className="p-5 space-y-3 border-primary/20 bg-primary/5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">How to pay</p>
              <p className="text-xs text-muted-foreground">Bank transfer</p>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              {business?.bank_account_name && (<><span className="text-muted-foreground">Account name</span><span className="font-medium">{business.bank_account_name}</span></>)}
              {business?.bank_name && (<><span className="text-muted-foreground">Bank</span><span className="font-medium">{business.bank_name}</span></>)}
              {business?.bank_account_number && (<><span className="text-muted-foreground">Account no.</span><span className="font-mono font-medium">{business.bank_account_number}</span></>)}
              {business?.bank_sort_code && (<><span className="text-muted-foreground">Sort code</span><span className="font-mono font-medium">{business.bank_sort_code}</span></>)}
              {business?.bank_iban && (<><span className="text-muted-foreground">IBAN</span><span className="font-mono font-medium">{business.bank_iban}</span></>)}
              <span className="text-muted-foreground">Reference</span><span className="font-mono font-medium">{invoice.number}</span>
              <span className="text-muted-foreground">Amount</span><span className="font-bold">{formatCurrency(balance, currency)}</span>
            </div>
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
          {!isPaid && balance > 0 && offered.cash && (
            <p className="text-sm text-muted-foreground">
              This invoice is payable by cash / in person. Please contact us to arrange payment.
            </p>
          )}
          {!isPaid && balance > 0 && offered.card && cardNote && (
            <p className="text-xs text-muted-foreground">{cardNote}</p>
          )}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {!isPaid && balance > 0 && offered.card && (
              <a
                href={`/api/stripe/checkout?invoice=${invoice.id}&token=${token}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                <CreditCard className="w-4 h-4" />
                {surcharge > 0
                  ? `Pay ${formatCurrency(balance + surcharge, currency)} with card (incl. ${formatCurrency(surcharge, currency)} fee)`
                  : `Pay ${formatCurrency(balance, currency)} with card`}
              </a>
            )}
            <a
              href={`/api/pdf/invoice/${invoice.id}?token=${token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </a>
          </div>

          {/* Autopay / card on file */}
          {offered.card && (
            customer?.autopay_enabled && customer?.stripe_payment_method_id ? (
              <p className="text-xs text-muted-foreground pt-1">
                Autopay is on — future invoices are charged automatically to your {customer.stripe_pm_brand ?? "card"}
                {customer.stripe_pm_last4 ? ` ending ${customer.stripe_pm_last4}` : ""}.{" "}
                <a href={`/api/stripe/save-card?token=${token}&invoice=${invoice.id}`} className="underline hover:text-foreground">Update card</a>
              </p>
            ) : (
              <a
                href={`/api/stripe/save-card?token=${token}&invoice=${invoice.id}`}
                className="inline-block text-xs text-primary underline hover:opacity-80 pt-1"
              >
                Save a card for automatic payments
              </a>
            )
          )}
        </Card>

        <footer className="text-center text-xs text-muted-foreground py-6 border-t">
          Powered by Kirei
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
