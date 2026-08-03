"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { KireiTabs } from "@/components/ui/kirei/tabs";
import { StatTile } from "@/components/ui/kirei/stat-tile";
import { EmptyState } from "@/components/ui/kirei/empty-state";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Send, Play, Pause, Plus, Trash2, Loader2, Target, MailCheck, MousePointer2, AlertCircle,
} from "@/components/ui/icons";
import {
  updateOutreachSettings, seedSequence, createSequence, deleteSequence,
  createCampaign, updateCampaign, deleteCampaign, enrollMatchingProspects,
  runOutreachNow, runSourcingNow, setPlacesApiKey, acknowledgeCrawlerCompliance,
} from "@/lib/actions/outreach";
import { SEED_SEQUENCES } from "@/lib/outreach/seed-sequences";
import { EMAIL_FONTS } from "@/lib/outreach/render";
import { EmailPreview } from "./email-preview";
import type { OutreachStats } from "@/lib/actions/outreach";
import type {
  OutreachSettings, OutreachSequence, OutreachCampaign, OutreachMessage,
} from "@/types/database";

type Tab = "overview" | "campaigns" | "sequences" | "activity" | "settings";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Stand-in copy so the design preview has something realistic in it. */
const SAMPLE_BODY = `Hi {{first_name}},

I wanted to introduce ourselves to {{company}} as a contractor for your portfolio.

Strata managers need someone they can call at any hour — and who leaves a paper trail the committee will accept.

Would a quick 10-minute call be worth it?`;

function pct(n: number, of: number): string {
  if (!of) return "—";
  return `${Math.round((n / of) * 100)}%`;
}

export function OutreachClient({
  settings: initialSettings, stats, campaigns, sequences, messages, businessName, businessLogoUrl,
}: {
  settings: OutreachSettings;
  stats: OutreachStats;
  campaigns: OutreachCampaign[];
  sequences: (OutreachSequence & { step_count: number })[];
  messages: OutreachMessage[];
  businessName: string;
  businessLogoUrl: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState(initialSettings);
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  const patch = (p: Partial<OutreachSettings>) => setSettings((s) => ({ ...s, ...p }));

  const saveSettings = () => {
    startTransition(async () => {
      try {
        await updateOutreachSettings({
          enabled: settings.enabled,
          daily_send_cap: settings.daily_send_cap,
          send_window_start: settings.send_window_start,
          send_window_end: settings.send_window_end,
          send_days: settings.send_days,
          seconds_between_sends: settings.seconds_between_sends,
          timezone: settings.timezone,
          from_local_part: settings.from_local_part,
          reply_to: settings.reply_to,
          signature_html: settings.signature_html,
          email_font: settings.email_font,
          email_accent: settings.email_accent,
          email_text_color: settings.email_text_color,
          email_width: settings.email_width,
          email_show_logo: settings.email_show_logo,
          sourcing_enabled: settings.sourcing_enabled,
          sourcing_queries: settings.sourcing_queries,
          sourcing_daily_quota: settings.sourcing_daily_quota,
        });
        toast.success("Settings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  };

  const sendNow = async () => {
    setRunning(true);
    try {
      const r = await runOutreachNow(25);
      toast.success(
        r.sent ? `Sent ${r.sent}${r.failed ? ` · ${r.failed} failed` : ""}` : "Nothing was due to send",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const activeCampaigns = campaigns.filter((c) => c.status === "running").length;

  return (
    <div>
      <PageHeader
        title="Outreach"
        subtitle="Multi-step cold email over your prospect list — sequences, campaigns and delivery tracking."
        actions={
          <>
            <Button variant="outline" onClick={sendNow} disabled={running || !settings.enabled}>
              {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send due now
            </Button>
            <Button onClick={() => setTab("campaigns")}>
              <Plus className="mr-1.5 h-4 w-4" /> New campaign
            </Button>
          </>
        }
      />

      {!settings.enabled && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div>
            <p className="text-sm font-semibold">Outreach is switched off</p>
            <p className="text-sm text-muted-foreground">
              Nothing sends — not from the hourly runner, and not from &ldquo;Send due now&rdquo; — until you turn it on.
            </p>
          </div>
          <Button
            onClick={() => {
              patch({ enabled: true });
              startTransition(async () => {
                await updateOutreachSettings({ enabled: true });
                toast.success("Outreach enabled");
                router.refresh();
              });
            }}
          >
            Turn on sending
          </Button>
        </div>
      )}

      <KireiTabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "campaigns", label: "Campaigns", count: campaigns.length },
          { value: "sequences", label: "Sequences", count: sequences.length },
          { value: "activity", label: "Activity", count: messages.length },
          { value: "settings", label: "Settings" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile toneColor="#1f4f4a" icon={<Send className="h-4 w-4" />} label="Sent" value={String(stats.sent)}
              sub={`${stats.delivered} delivered`} />
            <StatTile toneColor="#2563eb" icon={<MailCheck className="h-4 w-4" />} label="Opened" value={String(stats.opened)}
              sub={`${pct(stats.opened, stats.sent)} of sent`} />
            <StatTile toneColor="#7c3aed" icon={<MousePointer2 className="h-4 w-4" />} label="Clicked" value={String(stats.clicked)}
              sub={`${pct(stats.clicked, stats.sent)} of sent`} />
            <StatTile toneColor="#dc2626" icon={<AlertCircle className="h-4 w-4" />} label="Bounced" value={String(stats.bounced)}
              sub={`${pct(stats.bounced, stats.sent)} — keep under 2%`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In sequence</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{stats.active_enrollments}</p>
              <p className="text-xs text-muted-foreground">prospects with a step still due</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Running campaigns</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{activeCampaigns}</p>
              <p className="text-xs text-muted-foreground">of {campaigns.length} total</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Daily cap</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{settings.daily_send_cap}</p>
              <p className="text-xs text-muted-foreground">
                {settings.send_window_start.slice(0, 5)}–{settings.send_window_end.slice(0, 5)} · {settings.timezone}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-1 text-sm font-semibold">How it runs</p>
            <p className="text-sm text-muted-foreground">
              An hourly job checks whether the local time is inside your send window. If it is, it enrols any new
              prospects matching each running campaign&rsquo;s filter, then sends every step that&rsquo;s due — up to
              the daily cap. A hard bounce or a spam complaint stops that prospect&rsquo;s sequence immediately.
            </p>
          </div>
        </div>
      )}

      {tab === "campaigns" && (
        <CampaignsTab campaigns={campaigns} sequences={sequences} onDone={() => router.refresh()} />
      )}

      {tab === "sequences" && (
        <SequencesTab sequences={sequences} onDone={() => router.refresh()} />
      )}

      {tab === "activity" && <ActivityTab messages={messages} />}

      {tab === "settings" && (
        <SettingsTab
          settings={settings} patch={patch} save={saveSettings} busy={busy}
          businessName={businessName} businessLogoUrl={businessLogoUrl}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ── Campaigns ────────────────────────────────────────────────────────────────

function CampaignsTab({
  campaigns, sequences, onDone,
}: {
  campaigns: OutreachCampaign[];
  sequences: (OutreachSequence & { step_count: number })[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [seqId, setSeqId] = useState(sequences[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !seqId) { toast.error("Name and sequence are both required"); return; }
    setBusy(true);
    try {
      await createCampaign({ name, sequence_id: seqId, auto_enroll: true });
      toast.success("Campaign created as a draft — start it when you're ready");
      setName("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create");
    } finally { setBusy(false); }
  };

  const setStatus = async (c: OutreachCampaign, status: OutreachCampaign["status"]) => {
    try {
      await updateCampaign(c.id, { status });
      toast.success(status === "running" ? "Campaign started" : "Campaign paused");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  };

  const enrol = async (c: OutreachCampaign) => {
    try {
      const n = await enrollMatchingProspects(c.id);
      toast.success(n ? `Enrolled ${n} prospect${n === 1 ? "" : "s"}` : "No new matching prospects");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't enrol"); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold">New campaign</p>
        {sequences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a sequence first — a campaign is just a sequence pointed at a set of prospects.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Strata managers — Q3" />
            </div>
            <div className="min-w-[200px]">
              <Label htmlFor="c-seq">Sequence</Label>
              <select
                id="c-seq" value={seqId} onChange={(e) => setSeqId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.step_count} steps)</option>
                ))}
              </select>
            </div>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Create
            </Button>
          </div>
        )}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState icon={<Target className="h-6 w-6" />} title="No campaigns yet"
          hint="A campaign enrols prospects into a sequence and sends the steps on schedule." />
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const seq = sequences.find((s) => s.id === c.sequence_id);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {seq ? `${seq.name} · ${seq.step_count} steps` : "No sequence"}
                    {c.auto_enroll ? " · auto-enrols new matches" : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  c.status === "running" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : c.status === "paused" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"}`}>
                  {c.status}
                </span>
                <Button size="sm" variant="outline" onClick={() => enrol(c)}>Enrol matches</Button>
                {c.status === "running" ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus(c, "paused")}>
                    <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStatus(c, "running")}>
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Start
                  </Button>
                )}
                <button
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete campaign"
                  onClick={async () => {
                    if (!confirm(`Delete "${c.name}"? Enrollments go with it.`)) return;
                    await deleteCampaign(c.id); toast.success("Campaign deleted"); onDone();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sequences ────────────────────────────────────────────────────────────────

function SequencesTab({
  sequences, onDone,
}: {
  sequences: (OutreachSequence & { step_count: number })[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const fromSeed = async (vertical: string) => {
    setBusy(true);
    try {
      await seedSequence(vertical);
      toast.success("Sequence created from template — edit the copy before you start it");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {sequences.length === 0 ? (
          <EmptyState icon={<Send className="h-6 w-6" />} title="No sequences yet"
            hint="Start from a template below, or build one from scratch." />
        ) : sequences.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/outreach/sequences/${s.id}`} className="truncate text-sm font-semibold hover:underline">
                {s.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {s.step_count} step{s.step_count === 1 ? "" : "s"}
                {s.description ? ` · ${s.description}` : ""}
              </p>
            </div>
            <Link href={`/outreach/sequences/${s.id}`}>
              <Button size="sm" variant="outline">Edit steps</Button>
            </Link>
            <button
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete sequence"
              onClick={async () => {
                if (!confirm(`Delete "${s.name}"?`)) return;
                await deleteSequence(s.id); toast.success("Sequence deleted"); onDone();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Start from a template</p>
            <p className="text-xs text-muted-foreground">
              Four steps over two weeks: intro → nudge → availability → sign-off. Edit the copy before sending —
              anything in [square brackets] is yours to fill in.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
            const name = prompt("Sequence name?");
            if (!name?.trim()) return;
            await createSequence({ name });
            toast.success("Blank sequence created"); onDone();
          }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Blank
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SEED_SEQUENCES.map((s) => (
            <button
              key={s.vertical} disabled={busy} onClick={() => fromSeed(s.vertical)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
            >
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

function ActivityTab({ messages }: { messages: OutreachMessage[] }) {
  if (!messages.length) {
    return <EmptyState icon={<Send className="h-6 w-6" />} title="Nothing sent yet"
      hint="Every email this agent sends shows up here with its delivery, open, click and bounce state." />;
  }
  return (
    <div className="ch-table-wrap">
      <table className="ch-table">
        <thead>
          <tr>
            <th>Recipient</th><th>Subject</th><th>Step</th><th>Status</th><th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td className="ch-mono">{m.recipient}</td>
              <td className="max-w-[280px] truncate">{m.subject}</td>
              <td className="num">{m.step_order ?? "—"}</td>
              <td>
                <span className={`ch-pill ${
                  m.status === "bounced" || m.status === "failed" || m.status === "complained" ? "overdue"
                  : m.status === "clicked" || m.status === "opened" ? "paid"
                  : m.status === "delivered" ? "sent" : "draft"}`}>
                  {m.status}
                </span>
              </td>
              <td>{new Date(m.sent_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsTab({
  settings, patch, save, busy, businessName, businessLogoUrl, onDone,
}: {
  settings: OutreachSettings;
  patch: (p: Partial<OutreachSettings>) => void;
  save: () => void;
  busy: boolean;
  businessName: string;
  businessLogoUrl: string | null;
  onDone: () => void;
}) {
  const [placesKey, setPlacesKey] = useState("");
  const toggleDay = (d: number) => {
    const days = settings.send_days.includes(d)
      ? settings.send_days.filter((x) => x !== d)
      : [...settings.send_days, d].sort();
    patch({ send_days: days });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-4 text-sm font-semibold">Sending</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <div>
              <Label>Sending enabled</Label>
              <p className="text-xs text-muted-foreground">The master switch. Off means nothing sends, ever.</p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
          </div>
          <div>
            <Label htmlFor="cap">Daily send cap</Label>
            <Input id="cap" type="number" min={0} value={settings.daily_send_cap}
              onChange={(e) => patch({ daily_send_cap: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Across all campaigns. Ramp up slowly on a new domain.</p>
          </div>
          <div>
            <Label htmlFor="gap">Seconds between sends</Label>
            <Input id="gap" type="number" min={0} value={settings.seconds_between_sends}
              onChange={(e) => patch({ seconds_between_sends: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">A small gap looks less like a blast.</p>
          </div>
          <div>
            <Label>Send window opens</Label>
            <TimePicker value={settings.send_window_start.slice(0, 5)}
              onChange={(v) => patch({ send_window_start: v })} />
          </div>
          <div>
            <Label>Send window closes</Label>
            <TimePicker value={settings.send_window_end.slice(0, 5)}
              onChange={(v) => patch({ send_window_end: v })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Send days</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    settings.send_days.includes(i)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="tz">Timezone</Label>
            <Input id="tz" value={settings.timezone} onChange={(e) => patch({ timezone: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">The window is evaluated in this zone.</p>
          </div>
          <div>
            <Label htmlFor="from">From address (local part)</Label>
            <Input id="from" value={settings.from_local_part}
              onChange={(e) => patch({ from_local_part: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Sends as {settings.from_local_part}@your-business-domain.</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="reply">Reply-to</Label>
            <Input id="reply" type="email" value={settings.reply_to ?? ""} placeholder="info@yourbusiness.com.au"
              onChange={(e) => patch({ reply_to: e.target.value })} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save settings
          </Button>
        </div>
      </div>

      {/* Email design — rendered by the same function that sends, so this
          preview is the email, not an approximation of it. */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Email design</p>
        <p className="mb-4 text-xs text-muted-foreground">
          These sends should read like a personal email, not a newsletter — which is why there&rsquo;s no banner or
          button styling here. Keep it plain and it lands in the inbox rather than the promotions tab.
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="font">Font</Label>
                <select
                  id="font" value={settings.email_font}
                  onChange={(e) => patch({ email_font: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {Object.entries(EMAIL_FONTS).map(([k, f]) => (
                    <option key={k} value={k}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="width">Width (px)</Label>
                <Input id="width" type="number" min={320} max={900} value={settings.email_width}
                  onChange={(e) => patch({ email_width: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="accent">Accent</Label>
                <div className="flex gap-2">
                  <input id="accent" type="color" value={settings.email_accent}
                    onChange={(e) => patch({ email_accent: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1" />
                  <Input value={settings.email_accent} onChange={(e) => patch({ email_accent: e.target.value })} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">The rule above your signature.</p>
              </div>
              <div>
                <Label htmlFor="textcol">Text colour</Label>
                <div className="flex gap-2">
                  <input id="textcol" type="color" value={settings.email_text_color}
                    onChange={(e) => patch({ email_text_color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1" />
                  <Input value={settings.email_text_color} onChange={(e) => patch({ email_text_color: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Show your logo</Label>
                <p className="text-xs text-muted-foreground">
                  Off by default — a logo makes a cold email look like marketing.
                </p>
              </div>
              <Switch checked={settings.email_show_logo}
                onCheckedChange={(v) => patch({ email_show_logo: v })} />
            </div>

            <div>
              <Label htmlFor="sig">Signature (HTML)</Label>
              <Textarea id="sig" rows={5} value={settings.signature_html ?? ""}
                onChange={(e) => patch({ signature_html: e.target.value })}
                placeholder="<strong>Your Name</strong><br>Your Business<br>0400 000 000" />
              <p className="mt-1 text-xs text-muted-foreground">
                Appended to every step, above the unsubscribe line.
              </p>
            </div>

            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save design
            </Button>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
            <EmailPreview
              subject="Preferred contractor for your strata portfolio"
              body={SAMPLE_BODY}
              design={settings}
              businessName={businessName}
              businessLogoUrl={businessLogoUrl}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Prospect sourcing</p>
            <p className="text-xs text-muted-foreground">
              Find businesses via Google Places using your own API key. Places never returns email addresses, so
              sourced prospects arrive with a website and no email.
            </p>
          </div>
          <Switch checked={settings.sourcing_enabled} onCheckedChange={(v) => patch({ sourcing_enabled: v })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="queries">Search terms (one per line)</Label>
            <Textarea id="queries" rows={3} value={(settings.sourcing_queries ?? []).join("\n")}
              onChange={(e) => patch({ sourcing_queries: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              placeholder={"strata management\nproperty management\nfacilities management"} />
          </div>
          <div>
            <Label htmlFor="quota">Daily quota</Label>
            <Input id="quota" type="number" min={0} value={settings.sourcing_daily_quota}
              onChange={(e) => patch({ sourcing_daily_quota: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="pk">Google Places API key</Label>
            <div className="flex gap-2">
              <Input id="pk" type="password" value={placesKey} placeholder={settings.places_api_key_enc ? "•••••• saved" : "Paste key"}
                onChange={(e) => setPlacesKey(e.target.value)} />
              <Button variant="outline" onClick={async () => {
                try { await setPlacesApiKey(placesKey); setPlacesKey(""); toast.success("Key saved (encrypted)"); onDone(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save key"); }
              }}>Save</Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Stored encrypted. Never shown again after saving.</p>
          </div>
        </div>
        <div className="mt-4">
          <Button variant="outline" disabled={!settings.sourcing_enabled} onClick={async () => {
            try {
              const r = await runSourcingNow();
              if (r.errors.length) toast.error(r.errors[0]);
              else toast.success(`Found ${r.found} · added ${r.created} · skipped ${r.skipped} already known`);
              onDone();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Sourcing failed"); }
          }}>
            <Target className="mr-1.5 h-4 w-4" /> Source prospects now
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Website email crawling</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Visits a sourced business&rsquo;s own website to find a published contact address. Off by default and
              deliberately gated: the Spam Act 2003 (s.22) prohibits sending to addresses collected by
              address-harvesting software, so turning this on is recorded against your account with a timestamp.
              You remain responsible for having a lawful basis to contact anyone you email.
            </p>
            {settings.compliance_ack_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Acknowledged {new Date(settings.compliance_ack_at).toLocaleString("en-AU")}
              </p>
            )}
          </div>
          <Switch
            checked={settings.crawler_enabled}
            onCheckedChange={async (v) => {
              if (v && !confirm(
                "Turning this on records your acknowledgement, with a timestamp, that you have a lawful basis to contact the addresses it finds. Continue?",
              )) return;
              try {
                await acknowledgeCrawlerCompliance(v);
                patch({ crawler_enabled: v });
                toast.success(v ? "Crawling enabled and acknowledgement recorded" : "Crawling disabled");
                onDone();
              } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
            }}
          />
        </div>
      </div>
    </div>
  );
}
