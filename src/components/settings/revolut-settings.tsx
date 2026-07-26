"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GradientTile } from "@/components/ui/kirei";
import { CreditCard, Loader2, CheckCircle } from "@/components/ui/icons";
import { saveRevolutCredentials, disconnectRevolut, testRevolutConnection, type RevolutStatus } from "@/lib/actions/revolut";

export function RevolutSettings({ initial }: { initial: RevolutStatus }) {
  const [status, setStatus] = useState(initial);
  const [secret, setSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [mode, setMode] = useState(initial.mode);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState(false);

  const save = () =>
    startSave(async () => {
      try {
        if (enabled && !status.hasSecret && !secret.trim()) {
          toast.error("Paste your Revolut Merchant Secret key first.");
          return;
        }
        await saveRevolutCredentials({
          secret: secret.trim() || undefined,
          webhookSecret: webhookSecret.trim() || undefined,
          mode,
          enabled,
        });
        setStatus((s) => ({
          ...s, enabled, mode,
          hasSecret: s.hasSecret || !!secret.trim(),
          hasWebhookSecret: s.hasWebhookSecret || !!webhookSecret.trim(),
        }));
        setSecret("");
        setWebhookSecret("");
        toast.success("Revolut settings saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });

  const test = async () => {
    setTesting(true);
    try {
      const r = await testRevolutConnection();
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } finally {
      setTesting(false);
    }
  };

  const disconnect = () =>
    startSave(async () => {
      try {
        await disconnectRevolut();
        setStatus((s) => ({ ...s, enabled: false, hasSecret: false, hasWebhookSecret: false }));
        setEnabled(false);
        toast.success("Revolut disconnected");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to disconnect");
      }
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2.5 space-y-0">
        <GradientTile gradient="violet" size={28} radius={8}><CreditCard className="w-3.5 h-3.5" /></GradientTile>
        <CardTitle className="text-base flex items-center gap-2">
          Revolut
          {status.enabled && status.hasSecret && (
            <span className="ch-pill paid text-[10px] inline-flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />Live {status.mode === "sandbox" ? "(sandbox)" : ""}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Accept card &amp; Revolut Pay payments straight into your Revolut Business account.
          Paste your <strong>Merchant Secret key</strong> (server-side only — it&rsquo;s encrypted and never shown again).
        </p>

        {!status.encryptionReady && (
          <p className="text-xs text-destructive">Credential storage is unavailable — the server needs APP_ENCRYPTION_KEY set.</p>
        )}

        <div className="space-y-1.5">
          <Label>Merchant Secret key</Label>
          <Input type="password" autoComplete="off" placeholder={status.hasSecret ? "•••••••• (saved — leave blank to keep)" : "sk_..."} value={secret} onChange={(e) => setSecret(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Webhook signing secret <span className="text-muted-foreground font-normal">(from your Revolut webhook)</span></Label>
          <Input type="password" autoComplete="off" placeholder={status.hasWebhookSecret ? "•••••••• (saved — leave blank to keep)" : "wsk_..."} value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">In Revolut, create a webhook to <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/revolut/webhook</code> and paste its signing secret here.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <select value={mode} onChange={(e) => setMode(e.target.value as RevolutStatus["mode"])} className="w-full h-9 rounded-md border border-border bg-card px-2 text-sm">
              <option value="sandbox">Sandbox (testing)</option>
              <option value="live">Live</option>
            </select>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label className="block mb-1">Enabled</Label>
              <p className="text-[11px] text-muted-foreground">Show &ldquo;Pay with Revolut&rdquo; on invoices.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Save</Button>
          <Button variant="outline" onClick={test} disabled={testing || !status.hasSecret}>{testing && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Test connection</Button>
          {status.hasSecret && <Button variant="ghost" className="text-destructive ml-auto" onClick={disconnect} disabled={saving}>Disconnect</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
