"use client";

/**
 * Recharts-backed charts for /analytics, split into their own module so the
 * (heavy) recharts library can be dynamically imported. The analytics page
 * shell — KPIs, tables, CSS funnels — paints immediately; these stream in
 * behind a skeleton. Keeps recharts out of the /analytics first-load JS.
 */
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsPayload } from "@/lib/actions/analytics";

export function RevenueBars({ monthly, currency }: { monthly: AnalyticsPayload["monthly"]; currency: string }) {
  const fmt = (n: number) => formatCurrency(n, currency);
  const fmtShort = (n: number) =>
    Math.abs(n) >= 1000
      ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
      : n.toFixed(0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => fmtShort(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [fmt(Number(value ?? 0)), name === "revenue" ? "Paid" : "Invoiced"]}
        />
        <Legend
          formatter={(v) => v === "revenue" ? "Paid" : "Invoiced"}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        <Bar dataKey="invoiced" fill="hsl(var(--primary) / 0.18)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="revenue"  fill="hsl(var(--primary))"        radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuoteDonut({ funnel }: { funnel: AnalyticsPayload["quote_funnel"] }) {
  const total = funnel.draft + funnel.sent + funnel.accepted + funnel.rejected + funnel.expired;
  if (total === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No quotes in this period yet.
      </div>
    );
  }
  const decided = funnel.accepted + funnel.rejected + funnel.expired;
  const acceptRate = decided > 0 ? Math.round((funnel.accepted / decided) * 100) : 0;

  const slices = [
    { name: "Accepted", value: funnel.accepted, fill: "hsl(150 60% 38%)" },
    { name: "Sent",     value: funnel.sent,     fill: "hsl(var(--primary))" },
    { name: "Draft",    value: funnel.draft,    fill: "hsl(220 14% 75%)" },
    { name: "Rejected", value: funnel.rejected, fill: "hsl(0 70% 50%)" },
    { name: "Expired",  value: funnel.expired,  fill: "hsl(220 14% 60%)" },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 160, height: 160 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" innerRadius={56} outerRadius={78} paddingAngle={2} stroke="none">
              {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display text-2xl font-semibold tabular-nums">{acceptRate}%</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">accepted</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs w-full">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.fill }} />
            <span className="text-muted-foreground truncate">{s.name}</span>
            <span className="font-semibold ml-auto tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
