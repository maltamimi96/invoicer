"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createProgressInvoice } from "@/lib/actions/invoices";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentInvoiceId: string;
  parentNumber:    string;
  parentTotal:     number;
  alreadyBilled:   number;
  currency:        string;
}

const PRESETS = [25, 30, 50] as const;

export function ProgressInvoiceModal({
  open, onOpenChange, parentInvoiceId, parentNumber,
  parentTotal, alreadyBilled, currency,
}: Props) {
  const router = useRouter();
  const remaining = useMemo(() => Math.max(0, parentTotal - alreadyBilled), [parentTotal, alreadyBilled]);

  const [mode,    setMode]    = useState<"percent" | "amount">("percent");
  const [percent, setPercent] = useState<string>("30");
  const [amount,  setAmount]  = useState<string>(remaining.toFixed(2));
  const [desc,    setDesc]    = useState<string>("");
  const [busy,    setBusy]    = useState(false);

  const computedAmount = useMemo(() => {
    if (mode === "percent") {
      const p = Math.max(0, Math.min(100, parseFloat(percent) || 0));
      return Math.round((parentTotal * p) / 100 * 100) / 100;
    }
    return Math.max(0, parseFloat(amount) || 0);
  }, [mode, percent, amount, parentTotal]);

  const exceedsRemaining = computedAmount > remaining + 0.01;

  const submit = async () => {
    if (computedAmount <= 0) { toast.error("Enter an amount greater than zero"); return; }
    if (exceedsRemaining)    { toast.error(`Only ${formatCurrency(remaining, currency)} left to bill on ${parentNumber}`); return; }

    setBusy(true);
    try {
      const created = await createProgressInvoice({
        parent_invoice_id: parentInvoiceId,
        ...(mode === "percent"
          ? { percent: parseFloat(percent) }
          : { amount:  computedAmount }),
        description: desc.trim() || undefined,
      });
      toast.success(`${created.number} created`);
      onOpenChange(false);
      router.push(`/invoices/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create progress invoice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request progress payment</DialogTitle>
          <DialogDescription>
            Bill a portion of <span className="font-medium">{parentNumber}</span> now and the
            remainder later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick toggle */}
          <div className="flex gap-2 rounded-full bg-muted p-1 text-xs font-medium">
            <button
              onClick={() => setMode("percent")}
              className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
                mode === "percent" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Percentage
            </button>
            <button
              onClick={() => setMode("amount")}
              className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
                mode === "amount" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom amount
            </button>
          </div>

          {/* Inputs */}
          {mode === "percent" ? (
            <div>
              <Label htmlFor="percent">Percentage of total</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="percent"
                  type="number"
                  inputMode="decimal"
                  min="0" max="100" step="1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="flex-1"
                />
                <span className="self-center text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercent(String(p))}
                    className="px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted transition-colors"
                  >
                    {p}%
                  </button>
                ))}
                <button
                  onClick={() => { setMode("amount"); setAmount(remaining.toFixed(2)); }}
                  className="px-2.5 py-1 rounded-full border border-border text-xs hover:bg-muted transition-colors"
                >
                  Remainder
                </button>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0" step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label htmlFor="desc">Description (optional)</Label>
            <Input
              id="desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={`e.g. "30% deposit for ${parentNumber}"`}
              className="mt-1.5"
            />
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-border p-4 space-y-1.5 text-sm">
            <Row label="Job total"        value={formatCurrency(parentTotal,   currency)} />
            {alreadyBilled > 0 && (
              <Row label="Already billed" value={formatCurrency(alreadyBilled, currency)} muted />
            )}
            <Row label="Remaining"        value={formatCurrency(remaining,     currency)} muted />
            <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold">
              <span>This invoice</span>
              <span className={exceedsRemaining ? "text-destructive" : ""}>
                {formatCurrency(computedAmount, currency)}
              </span>
            </div>
            {exceedsRemaining && (
              <p className="text-xs text-destructive">Exceeds remaining balance by {formatCurrency(computedAmount - remaining, currency)}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || exceedsRemaining || computedAmount <= 0}>
            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {busy ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
