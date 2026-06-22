"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, CreditCard, Check, X, Settings as SettingsIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GradientTile } from "@/components/ui/kirei";
import {
  createStripeOnboardingLink,
  disconnectStripe,
  setPlatformFeePercent,
  setDepositPercent,
  setCardSurcharge,
  syncStripeAccountStatus,
  type StripeAccountStatus,
} from "@/lib/actions/stripe";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface Props { initial: StripeAccountStatus }

export function StripeSettings({ initial }: Props) {
  const [status, setStatus] = useState<StripeAccountStatus>(initial);
  const [connecting, setConnecting] = useState(false);
  const [syncing, startSync] = useTransition();
  const [feePct, setFeePct] = useState<string>(
    status.platformFeePercent != null ? String(status.platformFeePercent) : ""
  );
  const [savingFee, setSavingFee] = useState(false);
  const [depositPct, setDepositPct] = useState<string>(
    status.depositPercent != null ? String(status.depositPercent) : ""
  );
  const [savingDeposit, setSavingDeposit] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await createStripeOnboardingLink();
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "Couldn't start Stripe onboarding");
    }
  };

  const handleSync = () => {
    startSync(async () => {
      try {
        const next = await syncStripeAccountStatus();
        setStatus(next);
        toast.success("Refreshed from Stripe");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't refresh status");
      }
    });
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Stripe? You can re-link any time. Existing payment history stays.")) return;
    try {
      await disconnectStripe();
      setStatus({ ...status, connected: false, accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
      toast.success("Stripe disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect");
    }
  };

  const handleSaveFee = async () => {
    setSavingFee(true);
    try {
      const trimmed = feePct.trim();
      const next = trimmed === "" ? null : Number(trimmed);
      if (next != null && (!Number.isFinite(next) || next < 0 || next > 30)) {
        throw new Error("Fee must be between 0 and 30");
      }
      await setPlatformFeePercent(next);
      setStatus({ ...status, platformFeePercent: next });
      toast.success(next == null ? "Reverted to default fee" : "Platform fee saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save fee");
    } finally {
      setSavingFee(false);
    }
  };

  const handleSaveDeposit = async () => {
    setSavingDeposit(true);
    try {
      const trimmed = depositPct.trim();
      const next = trimmed === "" ? null : Number(trimmed);
      if (next != null && (!Number.isFinite(next) || next < 0 || next > 100)) {
        throw new Error("Deposit must be between 0 and 100");
      }
      await setDepositPercent(next);
      setStatus({ ...status, depositPercent: next });
      toast.success(next == null ? "Reverted to default deposit" : next === 0 ? "Deposit option disabled" : "Deposit % saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save deposit");
    } finally {
      setSavingDeposit(false);
    }
  };

  const [surEnabled, setSurEnabled] = useState(status.surchargeEnabled);
  const [surPct, setSurPct] = useState<string>(String(status.surchargePercent ?? 0));
  const [surFixed, setSurFixed] = useState<string>(String(status.surchargeFixed ?? 0));
  const [surNote, setSurNote] = useState<string>(status.surchargeNote ?? "");
  const [savingSur, setSavingSur] = useState(false);

  const handleSaveSurcharge = async () => {
    setSavingSur(true);
    try {
      const percent = Number(surPct) || 0;
      const fixed = Number(surFixed) || 0;
      if (percent < 0 || percent > 30) throw new Error("Surcharge % must be 0–30");
      if (fixed < 0) throw new Error("Fixed fee can't be negative");
      await setCardSurcharge({ enabled: surEnabled, percent, fixed, note: surNote.trim() || null });
      setStatus({ ...status, surchargeEnabled: surEnabled, surchargePercent: percent, surchargeFixed: fixed, surchargeNote: surNote.trim() || null });
      toast.success("Card surcharge saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save surcharge");
    } finally { setSavingSur(false); }
  };

  const liveFee = status.platformFeePercent ?? status.defaultFeePercent;
  const liveDeposit = status.depositPercent ?? status.defaultDepositPercent;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2.5 space-y-0">
        <GradientTile gradient="primary" size={28} radius={8}><CreditCard className="w-3.5 h-3.5" /></GradientTile>
        <CardTitle className="text-base">Card payments via Stripe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!status.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Let customers pay invoices online with a card. Money lands directly in your Stripe account; Kirei takes a {liveFee}% platform fee.
            </p>
            <Button type="button" onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
              Connect Stripe
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Stripe account</p>
                  <p className="text-xs text-muted-foreground font-mono">{status.accountId}</p>
                </div>
                <StatusChips status={status} />
              </div>
              {!status.chargesEnabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Stripe still needs more details before you can accept payments. Click <strong>Continue setup</strong> to finish.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {!status.detailsSubmitted ? (
                <Button type="button" onClick={handleConnect} disabled={connecting} variant="default">
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Continue setup
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SettingsIcon className="w-4 h-4 mr-2" />}
                  Refresh status
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={handleDisconnect}>Disconnect</Button>
            </div>

            <Separator />

            <div className="space-y-2 max-w-sm">
              <Label>Platform fee % (Kirei's cut)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  placeholder={String(status.defaultFeePercent)}
                  value={feePct}
                  onChange={(e) => setFeePct(e.target.value)}
                />
                <Button type="button" onClick={handleSaveFee} disabled={savingFee}>
                  {savingFee && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to use the platform default ({status.defaultFeePercent}%). Currently charging <strong>{liveFee}%</strong> per transaction.
              </p>
            </div>

            <Separator />

            <div className="space-y-2 max-w-sm">
              <Label>Quote deposit %</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder={String(status.defaultDepositPercent)}
                  value={depositPct}
                  onChange={(e) => setDepositPct(e.target.value)}
                />
                <Button type="button" onClick={handleSaveDeposit} disabled={savingDeposit}>
                  {savingDeposit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                When customers accept a quote online they can pay this deposit by card. Currently <strong>{liveDeposit}%</strong>. Set to <strong>0</strong> to hide the deposit option (full payment only). Blank = default ({status.defaultDepositPercent}%).
              </p>
            </div>

            <Separator />

            {/* Card surcharge — pass the processing fee to the customer */}
            <div className="space-y-3 max-w-md">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Pass card fee to customer</Label>
                  <p className="text-xs text-muted-foreground">Add a card processing fee on top when customers pay by card.</p>
                </div>
                <Switch checked={surEnabled} onCheckedChange={setSurEnabled} />
              </div>
              {surEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Percent (%)</Label>
                      <Input type="number" min="0" max="30" step="0.01" value={surPct} onChange={(e) => setSurPct(e.target.value)} placeholder="1.75" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fixed fee</Label>
                      <Input type="number" min="0" step="0.01" value={surFixed} onChange={(e) => setSurFixed(e.target.value)} placeholder="0.30" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note shown to the customer (optional)</Label>
                    <Textarea rows={2} value={surNote} onChange={(e) => setSurNote(e.target.value)} placeholder="Auto-generated from the rate if left blank, e.g. “A card processing fee of 1.75% + 0.30 applies when paying by card.”" />
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ Card surcharging is regulated — banned on consumer cards in the UK/EU and capped/regulated in AU &amp; parts of the US. Keep the rate at or below your actual cost of acceptance and follow your local rules.
                  </p>
                </>
              )}
              <Button type="button" onClick={handleSaveSurcharge} disabled={savingSur}>
                {savingSur && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save surcharge
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusChips({ status }: { status: StripeAccountStatus }) {
  const items = [
    { label: "Charges",  on: status.chargesEnabled },
    { label: "Payouts",  on: status.payoutsEnabled },
    { label: "Details",  on: status.detailsSubmitted },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map((i) => (
        <Badge key={i.label} variant={i.on ? "default" : "secondary"} className="gap-1">
          {i.on ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          {i.label}
        </Badge>
      ))}
    </div>
  );
}
