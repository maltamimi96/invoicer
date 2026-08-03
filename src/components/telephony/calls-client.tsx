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
          <Button variant="outline" disabled={busy} onClick={async () => {
            const n = await rematchCalls();
            toast.success(n ? `Matched ${n} more call${n === 1 ? "" : "s"}` : "No new matches");
            router.refresh();
          }}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Re-match callers
          </Button>
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
