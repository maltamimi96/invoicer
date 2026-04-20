"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Copy, Check, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { createPortalLink } from "@/lib/actions/customer-portal";

export function PortalLinkButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [days, setDays] = useState<string>("30");
  const [copied, setCopied] = useState(false);

  const generate = () => {
    start(async () => {
      try {
        const expires = days.trim() === "" ? null : Number(days);
        const { url } = await createPortalLink(customerId, { expires_in_days: expires ?? null });
        const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
        setLink(fullUrl);
        toast.success("Portal link created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setOpen(true); setLink(null); }}>
        <Link2 className="w-3.5 h-3.5" /> Portal link
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer portal link</DialogTitle>
            <DialogDescription>
              Generate a private link {customerName} can use to view their quotes, invoices, and jobs.
            </DialogDescription>
          </DialogHeader>

          {!link ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="days">Expires after (days)</Label>
                <Input
                  id="days"
                  type="number"
                  min="1"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder="30"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank for no expiry.</p>
              </div>
              <Button onClick={generate} disabled={pending} className="w-full">
                {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                Generate link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button onClick={copy} variant="outline" size="icon" className="flex-shrink-0">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Send this link via email or SMS. Anyone with the link can view {customerName}&apos;s account.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
