"use client";

import { TrendingUp, AlertCircle } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { JobProfitability } from "@/lib/actions/job-profitability";

const money = (n: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * What this job earned vs what it cost. Revenue comes from linked invoices;
 * cost is labour (logged hours × pay rate) + materials + linked expenses.
 */
export function JobProfitabilityCard({ data, currency }: { data: JobProfitability; currency?: string }) {
  const { revenue_invoiced, revenue_collected, labour_cost, labour_hours, materials_cost, expenses_cost, total_cost, margin, margin_percent, has_unrated_labour } = data;

  const nothingYet = revenue_invoiced === 0 && total_cost === 0;
  const positive = margin >= 0;

  // Cost split bar — proportion of each cost type.
  const parts = [
    { key: "Labour", value: labour_cost, cls: "bg-primary" },
    { key: "Materials", value: materials_cost, cls: "bg-blue-500" },
    { key: "Expenses", value: expenses_cost, cls: "bg-amber-500" },
  ].filter((p) => p.value > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Profitability</p>
      </div>

      {nothingYet ? (
        <p className="text-sm text-muted-foreground">
          No revenue or costs recorded yet. Invoice the job, log time, add materials or link an expense and the margin appears here.
        </p>
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{money(revenue_invoiced, currency)}</p>
              {revenue_collected !== revenue_invoiced && (
                <p className="text-[11px] text-muted-foreground">{money(revenue_collected, currency)} collected</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{money(total_cost, currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</p>
              <p className={cn("mt-0.5 text-lg font-bold tabular-nums", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {money(margin, currency)}
              </p>
              {margin_percent != null && (
                <p className={cn("text-[11px]", positive ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-rose-600/80 dark:text-rose-400/80")}>
                  {margin_percent}%
                </p>
              )}
            </div>
          </div>

          {/* Cost split */}
          {parts.length > 0 && (
            <div className="mt-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                {parts.map((p) => (
                  <div key={p.key} className={p.cls} style={{ width: `${(p.value / total_cost) * 100}%` }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {parts.map((p) => (
                  <span key={p.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", p.cls)} />
                    {p.key} {money(p.value, currency)}
                    {p.key === "Labour" && labour_hours > 0 && ` · ${labour_hours}h`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {has_unrated_labour && (
            <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              Some logged hours have no pay rate set, so labour cost is understated. Set rates on the Team page.
            </p>
          )}
        </>
      )}
    </div>
  );
}
