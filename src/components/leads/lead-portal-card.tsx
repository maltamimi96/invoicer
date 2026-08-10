"use client";

/**
 * The lead's own view — the customer end of their hub.
 *
 * Nothing here is new machinery. `/portal/<token>` already renders quotes,
 * invoices, work orders, reports and appointments off a contact row; a lead
 * that has been quoted already HAS that contact. What was missing was a way to
 * reach it, so this mints the link on demand.
 *
 * Deliberately on demand rather than eagerly: minting a portal token creates a
 * live, unauthenticated URL to someone's documents. That should happen when
 * you decide to share it, not because a page was loaded.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Copy, Check, Loader2, Globe } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { GradientTile, FadeIn } from "@/components/ui/kirei";
import { getLeadPortalLink } from "@/lib/actions/lead-billing";

export function LeadPortalCard({ leadId, delay = 250 }: { leadId: string; delay?: number }) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function make() {
    startTransition(async () => {
      const res = await getLeadPortalLink(leadId);
      if (!res.ok) { toast.error(res.error); return; }
      setUrl(res.url);
    });
  }

  return (
    <FadeIn delay={delay}>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <GradientTile gradient="ocean" size={28} radius={8}>
            <Globe className="h-3.5 w-3.5" />
          </GradientTile>
          <p className="text-sm font-semibold">Their view</p>
        </div>

        {url ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
              <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{url}</code>
              <Button
                size="sm" variant="ghost" className="h-7 shrink-0 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" /> Open
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Their quotes, invoices, jobs and reports, in one page. Anyone with this link can
              open it &mdash; send it to them, not to a group chat.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Give this lead a single page showing everything you&rsquo;ve sent them &mdash;
              quotes, invoices, jobs and reports. They stay a lead; only a payment makes a client.
            </p>
            <Button size="sm" variant="outline" onClick={make} disabled={pending}>
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                       : <Globe className="mr-1.5 h-3.5 w-3.5" />}
              Create their link
            </Button>
          </div>
        )}
      </div>
    </FadeIn>
  );
}
