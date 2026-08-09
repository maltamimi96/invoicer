"use client";

/**
 * The Kirei Dashboard v2 overview.
 *
 * Ported from the Claude Design project of the same name. Two things about the
 * port are worth knowing:
 *
 *  1. **The mock's colours are theme tokens now**, not literals. The design's
 *     --ac / --mu / --panel2 became --primary / --muted-foreground / --card in
 *     globals.css, so this file uses ordinary Tailwind classes and picks up
 *     whichever of the four palettes is active.
 *  2. **Every number here is real.** The mock ships invented figures
 *     (Ardent Studio, £12,600). Where the app has no source for a panel, the
 *     panel is sourced differently rather than filled with plausible fiction —
 *     see the revenue-split note below.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, FileCheck, Wrench, ChevronRight, DollarSign, Clock,
  AlertTriangle, CheckCircle, MapPin, User,
} from "@/components/ui/icons";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useVocab, lower } from "@/components/layout/vocab-provider";
import type { WorkOrderWithCustomer } from "@/types/database";

export interface DashboardV2Stats {
  totalRevenue: number;
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  recentInvoices: Array<{
    id?: string; number?: string; status?: string; total?: number;
    due_date?: string; issue_date?: string; customers?: { name?: string } | null;
  }>;
  monthlyData: Array<{ month: string; revenue: number; invoiced: number }>;
}

const RANGES = [3, 6, 12] as const;
const FILTERS = ["All", "Paid", "Sent", "Overdue"] as const;

/** Status → which semantic colour the mock uses for it. */
function toneFor(status?: string): "ok" | "warn" | "bad" | "mu" {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return "ok";
  if (s === "overdue") return "bad";
  if (s === "sent" || s === "partial") return "warn";
  return "mu";
}

const TONE_TEXT: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  mu: "text-muted-foreground",
};

function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function DashboardV2({
  stats, currency = "GBP", todayJobs, greeting,
}: {
  stats: DashboardV2Stats;
  currency?: string;
  todayJobs: WorkOrderWithCustomer[];
  /** "Morning" / "Afternoon" - the mock's header line, shown here because our
   *  header is global and this greeting is specific to the dashboard. */
  greeting: string;
}) {
  const jobs = useVocab("/work-orders", "Work Orders");
  const [range, setRange] = useState<(typeof RANGES)[number]>(6);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const series = useMemo(() => stats.monthlyData.slice(-range), [stats.monthlyData, range]);

  const overdueInvoices = stats.recentInvoices.filter((i) => (i.status ?? "").toLowerCase() === "overdue");

  const rows = useMemo(() => {
    if (filter === "All") return stats.recentInvoices;
    return stats.recentInvoices.filter((i) => (i.status ?? "").toLowerCase() === filter.toLowerCase());
  }, [stats.recentInvoices, filter]);

  /**
   * The mock's "Where the money comes from" splits revenue by service category
   * (Kitchens / Wardrobes / ...). Kirei stores no category on an invoice, so
   * inventing one would mean drawing a chart of nothing. Split by CUSTOMER
   * instead — same question, answered from data that actually exists.
   */
  const split = useMemo(() => {
    const byCustomer = new Map<string, number>();
    for (const inv of stats.recentInvoices) {
      const name = inv.customers?.name?.trim() || "Unattributed";
      byCustomer.set(name, (byCustomer.get(name) ?? 0) + Number(inv.total ?? 0));
    }
    const all = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 3);
    const restTotal = all.slice(3).reduce((n, [, v]) => n + v, 0);
    const parts = restTotal > 0 ? [...top, ["Everyone else", restTotal] as [string, number]] : top;
    const total = parts.reduce((n, [, v]) => n + v, 0);
    return { total, parts: parts.map(([name, value]) => ({ name, value, pct: total > 0 ? value / total : 0 })) };
  }, [stats.recentInvoices]);

  return (
    <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em]">{greeting}!</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Here&rsquo;s what&rsquo;s on your books today.</p>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3.5">
          <Link href="/invoices/new" className={cn(
            "flex items-center gap-2.5 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground",
            "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:brightness-110",
          )}>
            <Plus className="h-4 w-4" /> New invoice
          </Link>
          <Link href="/quotes/new" className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-border bg-card px-5 py-3.5 text-sm font-medium",
            "transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong",
          )}>
            <FileCheck className="h-4 w-4 text-accent-2" /> New quote
          </Link>
          <Link href="/work-orders/new" className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-border bg-card px-5 py-3.5 text-sm font-medium",
            "transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong",
          )}>
            <Wrench className="h-4 w-4 text-lime" /> New {lower(jobs.singular)}
          </Link>

          {/* The mock's overdue nudge. Shown only when there IS overdue money —
              a cheerful "£0 overdue across 0 invoices" is noise. */}
          {stats.overdue > 0 && (
            <button
              type="button"
              onClick={() => setFilter("Overdue")}
              className={cn(
                "ml-auto flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3",
                "transition-colors duration-200 hover:border-bad",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-bad" />
              <span className="text-sm font-medium">
                {formatCurrency(stats.overdue, currency)} overdue
                {overdueInvoices.length > 0 && ` across ${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* ── KPI tiles ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<DollarSign className="h-[18px] w-[18px] text-primary" />}
               label="Revenue, all time" value={formatCurrency(stats.totalRevenue, currency)} />
          <Kpi icon={<Clock className="h-[18px] w-[18px] text-accent-2" />}
               label="Outstanding" value={formatCurrency(stats.outstanding, currency)}
               note={`${stats.recentInvoices.filter((i) => ["sent", "partial", "overdue"].includes((i.status ?? "").toLowerCase())).length} open`} />
          <Kpi icon={<AlertTriangle className="h-[18px] w-[18px] text-bad" />}
               label="Overdue" value={formatCurrency(stats.overdue, currency)}
               badge={overdueInvoices.length > 0 ? `${overdueInvoices.length} late` : undefined} badgeTone="bad" />
          <Kpi icon={<CheckCircle className="h-[18px] w-[18px] text-primary-foreground" />}
               iconOnAccent
               label="Collected this month" value={formatCurrency(stats.paidThisMonth, currency)} emphasis />
        </div>

        {/* ── Revenue flow + split ──────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h3 className="text-base font-semibold">Revenue flow</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Paid invoices, trailing {range} months
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
                {RANGES.map((r) => (
                  <button key={r} type="button" onClick={() => setRange(r)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
                      range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}>{r}M</button>
                ))}
              </div>
            </div>
            <RevenueFlow series={series} currency={currency} />
          </section>

          <section className="overflow-hidden rounded-3xl border border-border bg-card p-5">
            <h3 className="text-base font-semibold">Where the money comes from</h3>
            {/* Said plainly: the mock split by service category, which Kirei
                does not record. This is by client, from recent invoices. */}
            <p className="mt-1 text-[13px] text-muted-foreground">By client, from recent invoices</p>
            {split.total <= 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="mt-5 flex flex-col items-center gap-5">
                <Donut parts={split.parts} />
                <div className="w-full space-y-2.5">
                  {split.parts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: SLICE[i % SLICE.length] }} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{p.name}</span>
                      <span className="text-[13px] font-semibold tabular-nums">{Math.round(p.pct * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Invoice ledger ────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h3 className="text-base font-semibold">Invoice ledger</h3>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
              {FILTERS.map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
                    filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}>{f}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[92px_1fr_110px_100px] gap-4 border-b border-border px-5 pb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground max-sm:hidden">
            <span>Number</span><span>Customer</span><span>Status</span><span className="text-right">Amount</span>
          </div>

          {rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {filter === "All" ? "No invoices yet." : `No ${filter.toLowerCase()} invoices.`}
            </p>
          ) : (
            <div className="p-2">
              {rows.map((inv) => {
                const tone = toneFor(inv.status);
                return (
                  <Link
                    key={inv.id ?? inv.number}
                    href={inv.id ? `/invoices/${inv.id}` : "/invoices"}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-background sm:grid-cols-[92px_1fr_110px_100px]"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{inv.number ?? "—"}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-semibold">
                        {initialsOf(inv.customers?.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{inv.customers?.name ?? "—"}</span>
                        {inv.issue_date && (
                          <span className="block text-xs text-muted-foreground">
                            Issued {new Date(inv.issue_date).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={cn(
                      "justify-self-start rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] max-sm:hidden",
                      TONE_TEXT[tone],
                    )}>{inv.status ?? "—"}</span>
                    <span className="text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(inv.total ?? 0), currency)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Scheduled ─────────────────────────────────────────────── */}
      <aside className="flex min-w-0 flex-col gap-4 xl:border-l xl:border-border xl:pl-6">
        <div>
          <h3 className="text-lg font-semibold">Scheduled</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {todayJobs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nothing booked in today.
          </div>
        ) : (
          todayJobs.map((job) => (
            <Link key={job.id} href={`/work-orders/${job.id}`}
              className="rounded-2xl border border-border bg-card p-4 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong">
              <p className="text-sm font-semibold">{job.customers?.name ?? "Job"}</p>
              {job.title && <p className="mt-1 text-xs text-muted-foreground">{job.title}</p>}
              {job.property_address && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{job.property_address}</span>
                </p>
              )}
              {job.assigned_to_email && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{job.assigned_to_email}</span>
                </p>
              )}
            </Link>
          ))
        )}
      </aside>
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function Kpi({
  icon, label, value, note, badge, badgeTone, emphasis, iconOnAccent,
}: {
  icon: React.ReactNode; label: string; value: string;
  note?: string; badge?: string; badgeTone?: "ok" | "bad"; emphasis?: boolean; iconOnAccent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px]",
      emphasis ? "border-border-strong bg-secondary" : "border-border bg-card",
    )}>
      <div className="flex items-center justify-between">
        <span className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          iconOnAccent ? "bg-primary" : "bg-accent-soft",
        )}>{icon}</span>
        {badge && (
          <span className={cn(
            "rounded-full bg-accent-soft px-2.5 py-1.5 text-xs font-semibold",
            badgeTone === "bad" ? "text-bad" : "text-ok",
          )}>{badge}</span>
        )}
        {!badge && note && <span className="text-xs font-medium text-muted-foreground">{note}</span>}
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
    </div>
  );
}

/**
 * The mock's line chart, drawn from real monthly totals.
 *
 * Plain SVG rather than recharts: it is one polyline and an area fill, and the
 * bundle-size budget in CI exists precisely to stop a chart library being
 * pulled into the dashboard for this.
 */
function RevenueFlow({ series, currency }: { series: Array<{ month: string; revenue: number }>; currency: string }) {
  const W = 640, H = 200, PAD = 8;
  if (series.length === 0) {
    return <p className="px-5 pb-8 text-center text-sm text-muted-foreground">No revenue recorded yet.</p>;
  }
  const max = Math.max(...series.map((m) => m.revenue), 1);
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const pt = (i: number, v: number) => [PAD + i * step, H - PAD - (v / max) * (H - PAD * 2)] as const;
  const points = series.map((m, i) => pt(i, m.revenue));
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${H - PAD} L${points[0][0].toFixed(1)},${H - PAD} Z`;

  return (
    <div className="px-5 pb-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img"
           aria-label={`Revenue over the last ${series.length} months, peaking at ${formatCurrency(max, currency)}`}>
        <defs>
          <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#revfill)" />
        <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        {series.map((m) => <span key={m.month}>{m.month}</span>)}
      </div>
    </div>
  );
}

const SLICE = [
  "hsl(var(--primary))",
  "hsl(var(--accent-2))",
  "hsl(var(--lime))",
  "hsl(var(--surface-3))",
];

function Donut({ parts }: { parts: Array<{ name: string; pct: number }> }) {
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90" role="img" aria-label="Revenue split by client">
      {parts.map((p, i) => {
        const len = p.pct * C;
        const el = (
          <circle key={p.name} cx="70" cy="70" r={R} fill="none" strokeWidth="16"
                  stroke={SLICE[i % SLICE.length]}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}
