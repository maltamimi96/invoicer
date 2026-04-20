"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle, XCircle, Info } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveEmailConfig, testEmailConnectionAction } from "@/lib/actions/email-config";
import type { BusinessEmailConfig, EmailProvider } from "@/types/database";
import { EMAIL_PROVIDERS } from "@/types/database";

interface EmailSettingsProps {
  config: (Omit<BusinessEmailConfig, "imap_pass"> & { imap_pass_masked: string }) | null;
}

export function EmailSettings({ config }: EmailSettingsProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [provider, setProvider] = useState<EmailProvider>(config?.provider as EmailProvider ?? "custom");
  const [host, setHost] = useState(config?.imap_host ?? "");
  const [port, setPort] = useState(config?.imap_port ?? 993);
  const [user, setUser] = useState(config?.imap_user ?? "");
  const [pass, setPass] = useState("");
  const [testResult, setTestResult] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const providerInfo = EMAIL_PROVIDERS.find((p) => p.value === provider);
  const isCustom = provider === "custom";
  const hasExistingPass = !!config?.imap_pass_masked;

  const handleProviderChange = (value: string) => {
    const p = value as EmailProvider;
    setProvider(p);
    const preset = EMAIL_PROVIDERS.find((x) => x.value === p);
    if (preset && preset.host) {
      setHost(preset.host);
      setPort(preset.port);
    }
    setTestResult("idle");
  };

  const handleSave = () => {
    if (!host || !user) {
      toast.error("Host and email are required");
      return;
    }
    if (!pass && !hasExistingPass && enabled) {
      toast.error("Password is required to enable email scanning");
      return;
    }

    startSaving(async () => {
      try {
        await saveEmailConfig({
          enabled,
          provider,
          imap_host: host,
          imap_port: port,
          imap_user: user,
          imap_pass: pass,
        });
        toast.success("Email settings saved");
        if (pass) setPass(""); // clear after save
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const handleTest = () => {
    if (!host || !user) {
      toast.error("Fill in host and email first");
      return;
    }
    if (!pass && !hasExistingPass) {
      toast.error("Enter a password to test");
      return;
    }

    setTestResult("testing");
    setTestError("");

    startTesting(async () => {
      try {
        const result = await testEmailConnectionAction({
          imap_host: host,
          imap_port: port,
          imap_user: user,
          imap_pass: pass,
        });
        if (result.ok) {
          setTestResult("success");
          toast.success("Connection successful!");
        } else {
          setTestResult("error");
          setTestError(result.error);
          toast.error(`Connection failed: ${result.error}`);
        }
      } catch {
        setTestResult("error");
        setTestError("Unexpected error");
        toast.error("Connection test failed");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Lead Scanner
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Automatically scan your inbox for new leads using AI. Unread emails are classified and genuine enquiries are added as leads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="email-enabled" className="text-xs text-muted-foreground">
            {enabled ? "Active" : "Off"}
          </Label>
          <Switch
            id="email-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider selector */}
        <div className="space-y-1.5">
          <Label>Email Provider</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {providerInfo?.help && (
            <div className="flex items-start gap-1.5 mt-1.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">{providerInfo.help}</p>
            </div>
          )}
        </div>

        {/* Host & Port (editable for custom, readonly for presets) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>IMAP Host</Label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="imap.example.com"
              readOnly={!isCustom}
              className={!isCustom ? "bg-muted" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Port</Label>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              readOnly={!isCustom}
              className={!isCustom ? "bg-muted" : ""}
            />
          </div>
        </div>

        {/* Email & Password */}
        <div className="space-y-1.5">
          <Label>Email Address</Label>
          <Input
            type="email"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="you@yourbusiness.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Password {hasExistingPass && !pass && <span className="text-muted-foreground font-normal">(saved)</span>}
          </Label>
          <Input
            type="password"
            value={pass}
            onChange={(e) => { setPass(e.target.value); setTestResult("idle"); }}
            placeholder={hasExistingPass ? "••••••••  (leave blank to keep current)" : "Enter password or App Password"}
          />
        </div>

        {/* Test connection */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : testResult === "success" ? (
              <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-500" />
            ) : testResult === "error" ? (
              <XCircle className="w-3.5 h-3.5 mr-1.5 text-destructive" />
            ) : (
              <Mail className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          {testResult === "success" && (
            <span className="text-xs text-green-600">Connected successfully</span>
          )}
          {testResult === "error" && (
            <span className="text-xs text-destructive">{testError}</span>
          )}
        </div>

        {/* Last checked */}
        {config?.last_checked && (
          <p className="text-xs text-muted-foreground">
            Last scanned: {new Date(config.last_checked).toLocaleString()}
          </p>
        )}

        {/* Save */}
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save email settings
        </Button>
      </CardContent>
    </Card>
  );
}
