"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  TrendingUp, DollarSign, Clock, AlertTriangle,
  CheckCircle, FileCheck, Users,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPayload, AnalyticsRange } from "@/lib/actions/analytics";

// recharts is heavy — load the two chart blocks lazily (client-only) so the
// KPI strip + tables paint immediately and the library stays out of the
// /analytics first-load JS. Skeleton keeps the layout from jumping.
const ChartSkeleton = ({ h }: { h: number }) => (
  <div className="w-full animate-pulse rounded-lg bg-muted" style={{ height: h }} />
);
const RevenueBars = dynamic(
  () => import("./analytics-charts").then((m) => ({ default: m.RevenueBars })),
  { ssr: false, loading: () => <ChartSkeleton h={260} /> },
);
const QuoteDonut = dynamic(
  () => import("./analytics-charts").then((m) => ({ default: m.QuoteDonut })),
  { ssr: false, loading: () => <ChartSkeleton h={160} /> },
);

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "30d": "30 days", "90d": "90 days", "12m": "12 months", "ytd": "Year to date",
};

interface Props {
  data: AnalyticsPayload;
  range: AnalyticsRange;
}

export function AnalyticsClient({ data, range }: Props) {
  const c = data.currency;
  const fmt = (n: number) => formatCurrency(n, c);

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={data.range.label}
        actions={
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-card">
            {(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map((r) => (
              <Link
                key={r}
                href={`/analytics?range=${r}`}
                replace
                scroll={false}
                className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {RANGE_LABELS[r]}
              </Link>
            ))}
          </div>
        }
      />

      {/* KPI strip */}
      <div className="ch-stat-grid">
        <div className="ch-stat">
          <div className="ch-stat-label"><DollarSign className="w-3.5 h-3.5" /><span>Revenue</span></div>
          <div className="ch-stat-value">{fmt(data.totals.revenue)}</div>
          <div className="ch-stat-meta">
            {data.totals.revenue_delta_pct != null ? (
              <>
                <TrendingUp className={`w-3 h-3 ${data.totals.revenue_delta_pct >= 0 ? "text-emerald-600" : "text-rose-600 rotate-180"}`} />
                <span className={`ch-stat-delta ${data.totals.revenue_delta_pct >= 0 ? "up" : "down"}`}>
                  {data.totals.revenue_delta_pct >= 0 ? "+" : ""}{data.totals.revenue_delta_pct}%
                </span>
                <span>vs prior period</span>
              </>
            ) : (
              <span>{data.totals.paid_count} paid invoices</span>
            )}
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Clock className="w-3.5 h-3.5" /><span>Outstanding</span></div>
          <div className="ch-stat-value">{fmt(data.totals.outstanding)}</div>
          <div className="ch-stat-meta">awaiting payment</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><AlertTriangle className="w-3.5 h-3.5" /><span>Overdue</span></div>
          <div className="ch-stat-value">{fmt(data.totals.overdue)}</div>
          <div className="ch-stat-meta">past due date</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><CheckCircle className="w-3.5 h-3.5" /><span>Avg invoice</span></div>
          <div className="ch-stat-value">{fmt(data.totals.avg_invoice_value)}</div>
          <div className="ch-stat-meta">per paid invoice</div>
        </div>
      </div>

      {/* Revenue chart — full width */}
      <div className="rounded-xl border border-border bg-card shadow-sm mb-4">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Revenue, last 12 months</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Paid (filled) vs invoiced (outline)</p>
          </div>
        </div>
        <div className="p-4">
          <RevenueBars monthly={data.monthly} currency={c} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top customers — 2 cols */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Top customers · all time</h3>
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          {data.top_customers.length === 0 ? (
            <div className="ch-empty">
              <h4>No paid invoices yet</h4>
              <p>Top customers will appear here as invoices land.</p>
            </div>
          ) : (
            <table className="ch-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Invoices</th>
                  <th className="num">Lifetime billed</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((cust, i) => (
                  <tr key={cust.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] flex items-center justify-center font-semibold text-[11px] flex-shrink-0">
                          {i + 1}
                        </div>
                        <Link href={`/customers/${cust.id}`} className="font-semibold hover:underline">
                          {cust.name}
                        </Link>
                      </div>
                    </td>
                    <td className="num">{cust.invoice_count}</td>
                    <td className="num font-semibold">{fmt(cust.total_billed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quote acceptance — 1 col */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Quote outcomes · {RANGE_LABELS[range].toLowerCase()}</h3>
            <FileCheck className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="p-4">
            <QuoteDonut funnel={data.quote_funnel} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* A/R aging */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">A/R aging · open invoices</h3>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="p-4 space-y-2.5">
            <AgingRow label="Current"     amount={data.ar_aging.current} currency={c} tone="ok"   />
            <AgingRow label="1 – 30 days" amount={data.ar_aging.b30}     currency={c} tone="ok"   />
            <AgingRow label="31 – 60 days"amount={data.ar_aging.b60}     currency={c} tone="warn" />
            <AgingRow label="61 – 90 days"amount={data.ar_aging.b90}     currency={c} tone="bad"  />
            <AgingRow label="90+ days"    amount={data.ar_aging.b90plus} currency={c} tone="bad"  />
          </div>
        </div>

        {/* Lead funnel */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lead funnel · {RANGE_LABELS[range].toLowerCase()}</h3>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="p-4">
            <LeadFunnel funnel={data.lead_funnel} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AgingRow({ label, amount, currency, tone }: {
  label: string; amount: number; currency: string; tone: "ok" | "warn" | "bad";
}) {
  const totalAll =
    Math.max(amount, 1); // for the bar; we'll compute pct against the row's max separately
  void totalAll;
  const color = tone === "ok" ? "hsl(150 60% 38%)" : tone === "warn" ? "hsl(35 75% 50%)" : "hsl(0 70% 50%)";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{formatCurrency(amount, currency)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: amount > 0 ? "100%" : "0%", background: color, opacity: amount > 0 ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

function LeadFunnel({ funnel }: { funnel: AnalyticsPayload["lead_funnel"] }) {
  const stages = [
    { key: "new",       label: "New",       value: funnel.new,       color: "hsl(217 90% 60%)" },
    { key: "contacted", label: "Contacted", value: funnel.contacted, color: "hsl(35 90% 55%)" },
    { key: "quoted",    label: "Quoted",    value: funnel.quoted,    color: "hsl(280 65% 55%)" },
    { key: "won",       label: "Won",       value: funnel.won,       color: "hsl(150 60% 38%)" },
    { key: "lost",      label: "Lost",      value: funnel.lost,      color: "hsl(0 70% 50%)" },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);
  const total = stages.reduce((s, x) => s + x.value, 0);
  const conversion = total > 0 ? Math.round((funnel.won / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-muted-foreground">{total} leads</span>
        <span className="text-xs">
          <span className="font-semibold text-emerald-600">{conversion}%</span>
          <span className="text-muted-foreground"> conversion</span>
        </span>
      </div>
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-foreground/80">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
