"use client";

/**
 * What's been raised against a lead, shown inside the pipeline drawer.
 *
 * The drawer had pipeline stage, tags and notes — and no link to the full
 * lead — so quotes, invoices and onboarding forms were invisible from the one
 * screen people actually work in. This puts the answer to "have we quoted
 * them yet?" where the question gets asked.
 *
 * Loads only when the drawer is open: the leads board renders one drawer at a
 * time, but fetching on mount would still mean a request for a panel nobody
 * opened.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileCheck, FileText, Loader2 } from "@/components/ui/icons";
import { getLeadDocuments, type LeadDocuments } from "@/lib/actions/lead-billing";

export function LeadDrawerBilling({ leadId, open }: { leadId: string; open: boolean }) {
  const [docs, setDocs] = useState<LeadDocuments | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getLeadDocuments(leadId)
      .then((d) => { if (!cancelled) setDocs(d); })
      // Silent: this is a supporting panel, and a failure here must not put an
      // error toast over someone trying to move a lead down the pipeline.
      .catch(() => { if (!cancelled) setDocs(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId, open]);

  if (loading && !docs) {
    return (
      <section>
        <Label />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
        </p>
      </section>
    );
  }

  const quotes = docs?.quotes ?? [];
  const invoices = docs?.invoices ?? [];

  return (
    <section>
      <Label />
      {quotes.length === 0 && invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing raised yet.{" "}
          <Link href={`/leads/${leadId}`} className="text-primary hover:underline">
            Quote them
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-1.5">
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:border-border-strong">
              <FileCheck className="h-3.5 w-3.5 shrink-0 text-accent-2" />
              <span className="font-mono text-xs text-muted-foreground">{q.number}</span>
              <span className="ml-auto text-xs capitalize text-muted-foreground">{q.status}</span>
            </Link>
          ))}
          {invoices.map((inv) => (
            <Link key={inv.id} href={`/invoices/${inv.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:border-border-strong">
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="font-mono text-xs text-muted-foreground">{inv.number}</span>
              <span className="ml-auto text-xs capitalize text-muted-foreground">{inv.status}</span>
            </Link>
          ))}
          {docs?.isClient && (
            <p className="pt-1 text-xs text-ok">They&rsquo;ve paid — this one&rsquo;s a client now.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Label() {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      Quotes &amp; invoices
    </p>
  );
}
