"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { KireiTabs } from "@/components/ui/kirei/tabs";
import { StatTile } from "@/components/ui/kirei/stat-tile";
import { EmptyState } from "@/components/ui/kirei/empty-state";
import { Phone, PhoneOff, Loader2, Copy, RefreshCw, AlertCircle } from "@/components/ui/icons";
import {
  updateTelephonySettings, rotateWebhookToken, rematchCalls,
  setTelephonyApiKey, testTelephonyConnection, syncCallsNow, setTelephonyEndpoint,
} from "@/lib/actions/telephony";
import { formatAuPhone } from "@/lib/telephony/phone";
import type { CallStats } from "@/lib/actions/telephony";
import type { TelephonySettings, Call } from "@/types/database";

type Tab = "log" | "missed" | "setup";

function duration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${sec % 60}s` : `${sec}s`;
}

/** Whoever the caller ID resolved to, with a link when there is one. */
function Party({ call }: { call: Call }) {
  if (call.customer_id) {
    return <Link href={`/customers/${call.customer_id}`} className="font-medium hover:underline">
      {call.customers?.name ?? "Customer"}
    </Link>;
  }
  if (call.lead_id) {
    return <Link href={`/leads/${call.lead_id}`} className="font-medium hover:underline">
      {call.leads?.name ?? "Lead"}
    </Link>;
  }
  if (call.contact_id) return <span className="font-medium">{call.contacts?.name ?? "Contact"}</span>;
  if (call.prospect_id) return <span className="font-medium">{call.prospects?.company ?? "Prospect"}</span>;
  return <span className="text-muted-foreground">{call.caller_name || "Unknown number"}</span>;
}

export function CallsClient({
  settings: initial, calls, stats, webhookUrl,
}: {
  settings: TelephonySettings;
  calls: Call[];
  stats: CallStats;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initial.enabled ? "log" : "setup");
  const [settings, setSettings] = useState(initial);
  const [url, setUrl] = useState(webhookUrl);
  const [busy, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const save = (p: Partial<TelephonySettings>) => {
    setSettings((s) => ({ ...s, ...p }));
    startTransition(async () => {
      try {
        await updateTelephonySettings(p);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  };

  const missed = calls.filter((c) => c.status === "missed" || c.status === "voicemail");
  const shown = tab === "missed" ? missed : calls;

  return (
    <div>
      <PageHeader
        title="Calls"
        subtitle="Every call logged against the customer, with missed calls turned into follow-ups."
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={async () => {
              const n = await rematchCalls();
              toast.success(n ? `Matched ${n} more call${n === 1 ? "" : "s"}` : "No new matches");
              router.refresh();
            }}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Re-match callers
            </Button>
            <Button disabled={syncing || !settings.enabled} onClick={async () => {
              setSyncing(true);
              try {
                const r = await syncCallsNow(30, true);
                if (r.errors.length) toast.error(r.errors[0]);
                else toast.success(`Synced ${r.ingested} of ${r.fetched} calls from the last 30 days`);
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Sync failed");
              } finally { setSyncing(false); }
            }}>
              {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Sync call history
            </Button>
          </>
        }
      />

      {!settings.enabled && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div>
            <p className="text-sm font-semibold">Phone system isn&rsquo;t connected yet</p>
            <p className="text-sm text-muted-foreground">
              Nothing is logged until you turn this on and paste the webhook URL into VoIPcloud.
            </p>
          </div>
          <Button onClick={() => { save({ enabled: true }); setTab("setup"); }}>Turn on</Button>
        </div>
      )}

      <KireiTabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "log", label: "All calls", count: calls.length },
          { value: "missed", label: "Missed & voicemail", count: missed.length },
          { value: "setup", label: "Setup" },
        ]}
      />

      {tab !== "setup" && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile toneColor="#1f4f4a" icon={<Phone className="h-4 w-4" />} label="Calls" value={String(stats.total)}
              sub={`${stats.inbound} in · ${stats.outbound} out`} />
            <StatTile toneColor="#dc2626" icon={<PhoneOff className="h-4 w-4" />} label="Missed" value={String(stats.missed)}
              sub="each one is a possible lost job" />
            <StatTile toneColor="#b45309" icon={<AlertCircle className="h-4 w-4" />} label="Voicemail" value={String(stats.voicemail)} />
            <StatTile toneColor="#64748b" icon={<Phone className="h-4 w-4" />} label="Unknown numbers" value={String(stats.unmatched)}
              sub="not on file yet" />
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={<Phone className="h-6 w-6" />} title="No calls yet"
              hint="Once the webhook is connected, every call through your PBX shows up here." />
          ) : (
            <div className="ch-table-wrap">
              <table className="ch-table">
                <thead>
                  <tr><th>Who</th><th>Number</th><th>Direction</th><th>Status</th><th>Length</th><th>When</th><th>Handled</th></tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const other = c.direction === "inbound" ? c.from_number : c.to_number;
                    return (
                      <tr key={c.id}>
                        <td><Party call={c} /></td>
                        <td className="ch-mono">{formatAuPhone(other)}</td>
                        <td className="capitalize">{c.direction}</td>
                        <td>
                          <span className={`ch-pill ${
                            c.status === "missed" || c.status === "failed" ? "overdue"
                            : c.status === "voicemail" ? "pending"
                            : c.status === "answered" || c.status === "completed" ? "paid" : "draft"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="num">{duration(c.duration_seconds)}</td>
                        <td>{new Date(c.started_at).toLocaleString("en-AU", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}</td>
                        <td className="text-xs text-muted-foreground">
                          {c.created_task_id ? "Task created" : c.created_lead_id ? "Lead created" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "setup" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Label>Connected</Label>
                <p className="text-xs text-muted-foreground">Master switch — off means nothing is logged.</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => save({ enabled: v })} />
            </div>

            {/* Connection status — an empty call list used to mean either
                "quiet" or "never connected", with no way to tell which. */}
            <div className={`mb-4 rounded-lg border p-3 text-sm ${
              settings.last_error_at && (!settings.last_event_at || settings.last_error_at > settings.last_event_at)
                ? "border-destructive/40 bg-destructive/10"
                : settings.last_event_at
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border bg-muted/40"}`}>
              {settings.last_error_at && (!settings.last_event_at || settings.last_error_at > settings.last_event_at) ? (
                <>
                  <p className="font-semibold">VoIPcloud is reaching us, but the request was rejected</p>
                  <p className="text-muted-foreground">
                    {settings.last_error} — {new Date(settings.last_error_at).toLocaleString("en-AU")}.
                    Check the Secret Token matches on both sides.
                  </p>
                </>
              ) : settings.last_event_at ? (
                <>
                  <p className="font-semibold">Connected</p>
                  <p className="text-muted-foreground">
                    Last event {new Date(settings.last_event_at).toLocaleString("en-AU")}
                    {settings.last_event_type ? ` (${settings.last_event_type})` : ""} ·{" "}
                    {settings.events_received} received in total.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Waiting for the first event</p>
                  <p className="text-muted-foreground">
                    Nothing has arrived yet. Paste the URL below into VoIPcloud, then make a test call — this box
                    updates as soon as anything reaches us, including a rejected request.
                  </p>
                </>
              )}
            </div>

            <Label htmlFor="hook">Webhook URL</Label>
            <div className="flex gap-2">
              <Input id="hook" readOnly value={url} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => {
                navigator.clipboard.writeText(url); toast.success("Copied");
              }}><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" disabled={busy} onClick={async () => {
                if (!confirm("Rotating breaks the old URL immediately — you'll need to paste the new one into VoIPcloud. Continue?")) return;
                setUrl(await rotateWebhookToken());
                toast.success("Rotated — update VoIPcloud with the new URL");
              }}>Rotate</Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              In VoIPcloud: <strong>Integration/API → Webhooks</strong>. Paste this URL, set a Secret Token, and
              tick the call events you want (inbound/outbound call, answered, completion, and voicemail).
            </p>

            <div className="mt-4">
              <Label htmlFor="secret">Secret token</Label>
              <Input id="secret" type="password" placeholder={settings.webhook_secret ? "•••••• set" : "Match the value you set in VoIPcloud"}
                onBlur={(e) => e.target.value && save({ webhook_secret: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">
                Sent back as the <code>X-Pbx-Token</code> header and checked on every request. Strongly recommended —
                the URL alone is otherwise the only thing protecting the endpoint.
              </p>
            </div>
          </div>

          {/* REST API — history sync and click-to-call. Separate from the
              webhook: the webhook pushes new calls, the API pulls old ones. */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">API access</p>
            <p className="mb-4 text-xs text-muted-foreground">
              The webhook only reports calls from the moment it&rsquo;s connected. An API key additionally lets Kirei
              pull past call history and place calls from a customer record.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="apikey">API key</Label>
                <div className="flex gap-2">
                  <Input id="apikey" type="password" value={apiKey}
                    placeholder={settings.api_key_enc ? "•••••• saved" : "Paste from VoIPcloud → API"}
                    onChange={(e) => setApiKey(e.target.value)} />
                  <Button variant="outline" disabled={!apiKey} onClick={async () => {
                    try {
                      await setTelephonyApiKey(apiKey); setApiKey("");
                      toast.success("Saved (encrypted)"); router.refresh();
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
                  }}>Save</Button>
                  <Button variant="outline" onClick={async () => {
                    const r = await testTelephonyConnection();
                    r.ok ? toast.success(r.message) : toast.error(r.message);
                  }}>Test</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Encrypted at rest and never shown again. If you&rsquo;ve set an IP whitelist in VoIPcloud, this
                  server&rsquo;s address has to be on it — Test will tell you if it isn&rsquo;t.
                </p>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="endpoint">Portal address</Label>
                <Input id="endpoint" defaultValue={settings.api_base_url ?? "https://au.voipcloud.online"}
                  placeholder="https://au.voipcloud.online"
                  onBlur={async (e) => {
                    try { await setTelephonyEndpoint(e.target.value); toast.success("Endpoint saved"); router.refresh(); }
                    catch (err) { toast.error(err instanceof Error ? err.message : "Invalid endpoint"); }
                  }} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Your VoIPcloud regional portal. Only change this if yours differs (uk, nz, …) — addresses outside
                  voipcloud.online are rejected, since this plugin connects to VoIPcloud only.
                </p>
              </div>

              <div>
                <Label htmlFor="ext">Call from extension</Label>
                <Input id="ext" defaultValue={settings.default_user_number ?? ""} placeholder="1010"
                  onBlur={(e) => save({ default_user_number: e.target.value || null })} />
                <p className="mt-1 text-xs text-muted-foreground">Rings first, then dials the customer.</p>
              </div>
              <div>
                <Label htmlFor="cid">Outgoing caller ID</Label>
                <Input id="cid" defaultValue={settings.default_caller_id ?? ""} placeholder="+61300000000"
                  onBlur={(e) => save({ default_caller_id: e.target.value || null })} />
                <p className="mt-1 text-xs text-muted-foreground">E.164. Optional.</p>
              </div>
            </div>

            {settings.last_sync_at && (
              <p className="mt-3 text-xs text-muted-foreground">
                Last history sync {new Date(settings.last_sync_at).toLocaleString("en-AU")}.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-3 text-sm font-semibold">When a call is missed</p>
            <div className="space-y-3">
              {([
                ["create_task_on_missed", "Create a call-back task", "A missed call is a possible lost job — this is the point of the integration."],
                ["create_task_on_voicemail", "Create a task for voicemail", "So a message can't sit unheard."],
                ["create_lead_on_missed", "Create a lead from unknown numbers", "Off by default: it adds a lead for every wrong number and cold caller too."],
                ["log_calls", "Log calls", "Turn off to keep the integration connected but stop recording call history."],
              ] as const).map(([key, label, hint]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div>
                    <Label>{label}</Label>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch checked={Boolean(settings[key])} onCheckedChange={(v) => save({ [key]: v })} />
                </div>
              ))}
            </div>
            {busy && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </p>}
          </div>
        </div>
      )}
    </div>
  );
}
