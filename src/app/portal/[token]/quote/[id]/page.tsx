import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, FileCheck } from "@/components/ui/icons";
import { AcceptQuoteButton } from "@/components/customer-portal/accept-quote-button";
import type { LineItem } from "@/types/database";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export default async function PortalQuotePage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) notFound();
  if (link.expires_at && new Date(link.expires_at) < new Date()) notFound();

  const [{ data: quote }, { data: business }, { data: customer }] = await Promise.all([
    tbl(sb, "quotes")
      .select("*")
      .eq("id", id)
      .eq("business_id", link.business_id)
      .eq("customer_id", link.customer_id)
      .maybeSingle(),
    tbl(sb, "businesses").select("name, logo_url, currency").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "customers").select("name, company, email, billing_address").eq("id", link.customer_id).maybeSingle(),
  ]);

  if (!quote) notFound();

  const currency = business?.currency || "GBP";
  const lineItems: LineItem[] = quote.line_items || [];
  const isAcceptable = quote.status !== "accepted" && quote.status !== "rejected" && quote.status !== "expired";

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
              <FileCheck className="w-6 h-6 text-violet-500" />
              <h1 className="text-2xl font-bold">Quote #{quote.number}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              From {business?.name} · Issued {formatDate(quote.issue_date)} · Expires {formatDate(quote.expiry_date)}
            </p>
          </div>
          <StatusBadge status={quote.status} />
        </div>

        {/* Customer */}
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Prepared for</p>
          <p className="font-medium mt-1">{customer?.name}</p>
          {customer?.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
          {customer?.billing_address && <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">{customer.billing_address}</p>}
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
          <Card className="p-5 w-full max-w-xs">
            <Row label="Subtotal" value={formatCurrency(quote.subtotal, currency)} />
            {quote.discount_amount > 0 && <Row label="Discount" value={`-${formatCurrency(quote.discount_amount, currency)}`} />}
            {quote.tax_total > 0 && <Row label="Tax" value={formatCurrency(quote.tax_total, currency)} />}
            <div className="border-t border-border my-2" />
            <Row label="Total" value={formatCurrency(quote.total, currency)} bold />
          </Card>
        </div>

        {/* Notes / terms */}
        {(quote.notes || quote.terms) && (
          <Card className="p-5 space-y-3">
            {quote.notes && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notes</p>
                <p className="text-sm mt-1 whitespace-pre-line">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Terms</p>
                <p className="text-sm mt-1 whitespace-pre-line">{quote.terms}</p>
              </div>
            )}
          </Card>
        )}

        {/* Action */}
        {isAcceptable ? (
          <Card className="p-6 border-emerald-500/30 bg-emerald-500/5 text-center space-y-3">
            <p className="text-sm">Happy with this quote? Accept and we&apos;ll get started.</p>
            <AcceptQuoteButton token={token} quoteId={quote.id} />
          </Card>
        ) : quote.status === "accepted" ? (
          <Card className="p-6 border-emerald-500/30 bg-emerald-500/5 text-center">
            <p className="font-medium text-emerald-600 dark:text-emerald-400">✓ Quote accepted</p>
            <p className="text-xs text-muted-foreground mt-1">Thanks — we&apos;ll be in touch shortly.</p>
          </Card>
        ) : null}

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
    accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    rejected: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    expired: "bg-muted text-muted-foreground",
    draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return <Badge variant="secondary" className={map[status] || "bg-muted"}>{status}</Badge>;
}
