"use client";

/**
 * Quoting and invoicing a lead, from the lead.
 *
 * "New quote" prepares the lead's contact row and then hands off to the normal
 * quote builder — deliberately, so there is no second quote form to keep in
 * step with the real one. The lead stays a lead throughout; only a payment
 * makes them a client.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { FileCheck, FileText, Loader2, Plus, CheckCircle } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { contactForLead, type LeadDocuments } from "@/lib/actions/lead-billing";

export function LeadBillingCard({
  leadId, docs, currency = "GBP",
}: { leadId: string; docs: LeadDocuments; currency?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"quote" | "invoice" | null>(null);

  const start = async (kind: "quote" | "invoice") => {
    setBusy(kind);
    try {
      const res = await contactForLead(leadId);
      if (!res.ok) { toast.error(res.error); return; }
      // Straight into the real builder, pre-pointed at this contact.
      router.push(`/${kind}s/new?customer=${res.customer_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  };

  const nothingYet = docs.quotes.length === 0 && docs.invoices.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => start("quote")} disabled={busy !== null}>
          {busy === "quote" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          New quote
        </Button>
        <Button size="sm" variant="outline" onClick={() => start("invoice")} disabled={busy !== null}>
          {busy === "invoice" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          New invoice
        </Button>
        {docs.isClient && (
          <Badge className="ml-auto gap-1.5 bg-ok/15 text-ok">
            <CheckCircle className="h-3.5 w-3.5" /> Paying client
          </Badge>
        )}
      </div>

      {/* The rule, said once where it matters rather than left to be guessed. */}
      <p className="text-xs text-muted-foreground">
        {docs.isClient
          ? "They've paid, so they're a client now and appear under Clients."
          : "Quoting a lead doesn't make them a client — they move to Clients when a payment comes in."}
      </p>

      {nothingYet ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nothing billed to this lead yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {docs.quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}>
              <Card className="transition-colors hover:border-border-strong">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <FileCheck className="h-4 w-4 shrink-0 text-accent-2" />
                  <span className="font-mono text-xs text-muted-foreground">{q.number}</span>
                  <span className="text-xs capitalize text-muted-foreground">{q.status}</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(q.total ?? 0), currency)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
          {docs.invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}>
              <Card className="transition-colors hover:border-border-strong">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">{inv.number}</span>
                  <span className="text-xs capitalize text-muted-foreground">{inv.status}</span>
                  {inv.due_date && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      due {formatDate(inv.due_date)}
                    </span>
                  )}
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(inv.total ?? 0), currency)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
