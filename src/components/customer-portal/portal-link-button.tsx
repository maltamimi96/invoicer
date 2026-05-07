"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link2, Copy, Check, Loader2, ExternalLink, MessageSquare, RefreshCw } from "@/components/ui/icons";
import { toast } from "sonner";
import { getShareLinks, revokePortalLink, createPortalLink } from "@/lib/actions/customer-portal";

interface Props {
  customerId:    string;
  customerName:  string;
  customerPhone?: string | null;
}

/** Customer portal link surfaced on the customer detail page.
 *  Opens with the current active link already visible — reuses any active
 *  token (90-day default), only mints a fresh one if there isn't one. */
export function PortalLinkButton({ customerId, customerName, customerPhone }: Props) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [link,    setLink]    = useState<string>("");
  const [copied,  setCopied]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getShareLinks({ customer_id: customerId });
      setLink(r.hub_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load link");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Fetch the link as soon as the dialog opens so the user never sees a "click to generate" state.
  useEffect(() => { if (open) load(); }, [open, load]);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  };

  /** Revoke the current token and mint a fresh one — useful if the customer
   *  forwarded the old link to someone else. */
  const rotate = async () => {
    setLoading(true);
    try {
      // Pull the existing token off the URL we're showing so we can revoke it.
      const tokenMatch = link.match(/\/portal\/(cust_[a-z0-9]+)/);
      if (tokenMatch?.[1]) await revokePortalLink(tokenMatch[1]);
      // Then mint fresh (90 day) — bypasses the reuse path in getShareLinks.
      const r = await createPortalLink(customerId, { expires_in_days: 90 });
      const fullUrl = r.url.startsWith("http") ? r.url : `${window.location.origin}${r.url}`;
      setLink(fullUrl);
      toast.success("New link generated, old one revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rotate");
    } finally {
      setLoading(false);
    }
  };

  const firstName = customerName?.split(" ")[0] ?? "";
  const greet = firstName ? `Hi ${firstName}, ` : "";
  const message = `${greet}here's your customer portal: ${link}`;
  const phoneE164 = customerPhone?.replace(/[^\d+]/g, "") ?? "";

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Link2 className="w-3.5 h-3.5" /> Customer hub link
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4" /> {customerName}&apos;s portal link
            </DialogTitle>
            <DialogDescription>
              One private URL — opens to a hub showing all of {customerName}&apos;s invoices, quotes, jobs and reports. Reuse this link as much as you like; rotate it if you ever need to invalidate the old one.
            </DialogDescription>
          </DialogHeader>

          {loading && !link ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading link…
            </div>
          ) : (
            <div className="space-y-4">
              {/* The link itself */}
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-muted rounded-md border border-border font-mono"
                />
                <Button onClick={copy} variant="outline" size="icon" className="flex-shrink-0" title="Copy">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
                <a href={link} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="icon" title="Open in new tab">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              </div>

              {/* Quick share */}
              <div className="flex flex-wrap gap-2">
                {phoneE164 && (
                  <a
                    href={`https://wa.me/${phoneE164.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm" variant="outline" className="gap-1.5 h-8">
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                  </a>
                )}
                {phoneE164 && (
                  <a href={`sms:${phoneE164}?body=${encodeURIComponent(message)}`}>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8">
                      <MessageSquare className="w-3.5 h-3.5" /> SMS
                    </Button>
                  </a>
                )}
                <a href={`mailto:?subject=Your portal link&body=${encodeURIComponent(message)}`}>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8">
                    Email
                  </Button>
                </a>
              </div>

              {/* Rotate */}
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-[11px] text-muted-foreground">
                  Anyone with the link can view — treat it like a password.
                </p>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={rotate} disabled={loading}>
                  <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  Rotate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
