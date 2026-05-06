"use client";

import { useEffect, useState } from "react";
import { Copy, Link2 as LinkIcon, ExternalLink, MessageSquare, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getShareLinks } from "@/lib/actions/customer-portal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  docType: "invoice" | "quote" | "report";
  docId: string;
  docNumber: string;
}

/** Share a single document or the full customer hub via copy / WhatsApp / SMS.
 *  Reuses any active portal token for that customer so the same link keeps
 *  working — otherwise mints a fresh 90-day token. */
export function ShareWithCustomerDialog({
  open, onOpenChange, customerId, customerName, customerPhone, docType, docId, docNumber,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [hubUrl, setHubUrl] = useState<string>("");
  const [docUrl, setDocUrl] = useState<string>("");

  useEffect(() => {
    if (!open || !customerId) return;
    setLoading(true);
    getShareLinks({ customer_id: customerId, doc_type: docType, doc_id: docId })
      .then((r) => { setHubUrl(r.hub_url); setDocUrl(r.doc_url ?? ""); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't generate link"))
      .finally(() => setLoading(false));
  }, [open, customerId, docType, docId]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — long-press the field and copy manually");
    }
  };

  const docLabel = docType[0].toUpperCase() + docType.slice(1);
  const firstName = customerName?.split(" ")[0] ?? "";
  const greet = firstName ? `Hi ${firstName}, ` : "";
  const docMsg = `${greet}here's your ${docType} ${docNumber}: ${docUrl}`;
  const hubMsg = `${greet}here are all your documents with us: ${hubUrl}`;

  // Strip non-digits so wa.me / sms: get a clean number
  const phoneE164 = customerPhone?.replace(/[^\d+]/g, "") ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Share {docLabel} {docNumber}
          </DialogTitle>
          <DialogDescription>
            {customerName ? `Send ${customerName} a private link.` : "Send a private link."} Same token also opens the customer hub with all their invoices, quotes and jobs.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating link…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Doc link */}
            {docUrl && (
              <Section
                label={`${docLabel} link`}
                hint={`Opens just this ${docType}.`}
                url={docUrl}
                onCopy={() => copy(docUrl, `${docLabel} link`)}
                phoneE164={phoneE164}
                shareMessage={docMsg}
              />
            )}

            {/* Hub link */}
            <Section
              label="Customer hub link"
              hint="Opens everything they have with you (all invoices, quotes, jobs)."
              url={hubUrl}
              onCopy={() => copy(hubUrl, "Hub link")}
              phoneE164={phoneE164}
              shareMessage={hubMsg}
            />
          </div>
        )}

        <p className="text-[11px] text-muted-foreground pt-2 border-t">
          Anyone with the link can view — treat it like a password. Revoke from <span className="font-mono">Customer → Portal links</span>.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label, hint, url, onCopy, phoneE164, shareMessage,
}: {
  label: string;
  hint: string;
  url: string;
  onCopy: () => void;
  phoneE164: string;
  shareMessage: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-muted rounded-md border border-border font-mono"
        />
        <Button size="sm" variant="outline" className="gap-1" onClick={onCopy}>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </Button>
        <a href={url} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" className="gap-1">
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </Button>
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        {phoneE164 && (
          <a
            href={`https://wa.me/${phoneE164.replace(/^\+/, "")}?text=${encodeURIComponent(shareMessage)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="outline" className="gap-1.5 h-8">
              <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
            </Button>
          </a>
        )}
        {phoneE164 && (
          <a href={`sms:${phoneE164}?body=${encodeURIComponent(shareMessage)}`}>
            <Button size="sm" variant="outline" className="gap-1.5 h-8">
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </Button>
          </a>
        )}
        <a href={`mailto:?body=${encodeURIComponent(shareMessage)}`}>
          <Button size="sm" variant="outline" className="gap-1.5 h-8">
            Email
          </Button>
        </a>
      </div>
    </div>
  );
}
