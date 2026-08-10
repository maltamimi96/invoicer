"use client";

/**
 * Bank details held for a client, so someone can pay them by hand.
 *
 * Two things the UI has to get right:
 *
 *  1. **Nothing sensitive renders until asked.** The list shows a masked hint
 *     and the account holder's name. The number arrives only on Reveal, which
 *     is a server round-trip that writes an audit entry — so the value is
 *     never sitting in a prop, an RSC payload or a devtools inspection.
 *  2. **Revealed values do not linger.** They clear on close and after a
 *     minute, because "I'll just leave that open" is how a bank account ends
 *     up on a shared screen.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Plus, Trash2, Eye, EyeOff, Loader2, Copy, Check, Lock } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PAYMENT_KINDS, kindDef, type PaymentDetailKind } from "@/lib/payments/details";
import {
  savePaymentDetail, deletePaymentDetail, revealPaymentDetail,
  type PaymentDetailView,
} from "@/lib/actions/payment-details";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

interface Props {
  customerId: string;
  details: PaymentDetailView[];
  /** False when APP_ENCRYPTION_KEY is missing — saving is refused, not faked. */
  ready: boolean;
}

const BLANK = {
  kind: "bank_au" as PaymentDetailKind,
  label: "", holder_name: "", bank_name: "",
  account: "", routing: "", notes: "", is_default: false,
};

export function PaymentDetailsCard({ customerId, details, ready }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [shown, setShown] = useState<Record<string, { account: string | null; routing: string | null }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Anything revealed clears itself after a minute. Leaving an account number
  // on screen indefinitely is the failure mode this feature invites.
  useEffect(() => {
    if (Object.keys(shown).length === 0) return;
    const t = setTimeout(() => setShown({}), 60_000);
    return () => clearTimeout(t);
  }, [shown]);

  const def = kindDef(form.kind);

  function save() {
    startTransition(async () => {
      const res = await savePaymentDetail(null, customerId, form);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved");
      setOpen(false); setForm({ ...BLANK });
      router.refresh();
    });
  }

  function reveal(d: PaymentDetailView) {
    if (shown[d.id]) { setShown((s) => { const n = { ...s }; delete n[d.id]; return n; }); return; }
    setBusyId(d.id);
    startTransition(async () => {
      const res = await revealPaymentDetail(d.id);
      setBusyId(null);
      if (!res.ok) { toast.error(res.error); return; }
      setShown((s) => ({ ...s, [d.id]: res.data }));
    });
  }

  async function remove(d: PaymentDetailView) {
    const ok = await confirm({
      title: `Delete ${d.label ?? "these details"}?`,
      body: "The stored account number is destroyed. You'd need to ask the client for it again.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deletePaymentDetail(d.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Deleted");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Payment details</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!ready}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {!ready && (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          APP_ENCRYPTION_KEY isn&rsquo;t set on the server, so these can&rsquo;t be stored safely.
          Saving is disabled rather than writing bank details in the clear.
        </p>
      )}

      {details.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing stored. Add the client&rsquo;s bank details once and they&rsquo;re here when you pay them.
        </p>
      ) : (
        <div className="space-y-2">
          {details.map((d) => {
            const revealed = shown[d.id];
            const kd = kindDef(d.kind);
            return (
              <div key={d.id} className="rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {d.label ?? kd.label}
                      {d.is_default && (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {kd.label}
                      {d.holder_name && <> · {d.holder_name}</>}
                      {d.hint && <> · <span className="font-mono">{d.hint}</span></>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => reveal(d)}
                    disabled={pending && busyId === d.id}>
                    {busyId === d.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      : revealed ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(d)}
                    disabled={pending} aria-label={`Delete ${d.label ?? "details"}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {revealed && (
                  <div className="mt-2.5 space-y-1.5 rounded-md bg-muted/50 p-2.5">
                    {kd.routingLabel && (
                      <RevealRow label={kd.routingLabel} value={revealed.routing}
                        copied={copied} setCopied={setCopied} />
                    )}
                    <RevealRow label={kd.accountLabel} value={revealed.account}
                      copied={copied} setCopied={setCopied} />
                    <p className="pt-0.5 text-[11px] text-muted-foreground">
                      Logged against your name. Hides itself in a minute.
                    </p>
                  </div>
                )}

                {d.notes && <p className="mt-1.5 text-xs text-muted-foreground">{d.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        Encrypted at rest. Owner and admin only, and every reveal is logged.
        Card numbers can&rsquo;t be stored here.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add payment details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-kind">Type</Label>
              <select id="pd-kind" className={selectCls} value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PaymentDetailKind }))}>
                {PAYMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">{def.hintText}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pd-holder">Account name</Label>
              <Input id="pd-holder" value={form.holder_name} placeholder="Whose account it is"
                onChange={(e) => setForm((f) => ({ ...f, holder_name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {def.routingLabel && (
                <div className="space-y-1.5">
                  <Label htmlFor="pd-routing">{def.routingLabel}</Label>
                  <Input id="pd-routing" value={form.routing} inputMode="numeric"
                    onChange={(e) => setForm((f) => ({ ...f, routing: e.target.value }))} />
                </div>
              )}
              <div className={def.routingLabel ? "space-y-1.5" : "col-span-2 space-y-1.5"}>
                <Label htmlFor="pd-account">{def.accountLabel}</Label>
                <Input id="pd-account" value={form.account}
                  onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pd-bank">Bank / institution</Label>
              <Input id="pd-bank" value={form.bank_name}
                onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pd-notes">Notes</Label>
              <Input id="pd-notes" value={form.notes} placeholder="Reference to quote, when they pay…"
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="pd-default" className="text-sm font-normal">Use as the default</Label>
              <Switch id="pd-default" checked={form.is_default}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending || !ready}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevealRow({
  label, value, copied, setCopied,
}: {
  label: string; value: string | null;
  copied: string | null; setCopied: (v: string | null) => void;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
      <Button
        size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(value);
          setTimeout(() => setCopied(null), 1500);
        }}
      >
        {copied === value ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}
