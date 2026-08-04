"use client";

import type { BooksSummary } from "@/lib/actions/books";

const money = (n: number) => `$${(Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const catLabel = (c: string) => c.replace(/-/g, " ");

/**
 * The books for a period: what came in, what went out, what's left, and the
 * GST position. Cash basis — see src/lib/actions/books.ts for why.
 */
export function BooksPanel({ books }: { books: BooksSummary }) {
  const { income, expenses, net, gstCollected, gstPaid, gstNet, byCategory, byVendor, byMonth } = books;
  const profitable = net >= 0;
  const maxBar = Math.max(1, ...byMonth.map((m) => Math.max(m.income, m.expenses)));

  return (
    <div className="space-y-5">
      {/* Money in / out / left — the three numbers that matter */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Money in</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(income)}</p>
          <p className="text-xs text-muted-foreground">payments received</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Money out</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{money(expenses)}</p>
          <p className="text-xs text-muted-foreground">{books.expenseCount} expenses</p>
        </div>
        <div className={`rounded-xl border p-4 ${profitable ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {profitable ? "Profit" : "Loss"}
          </p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${profitable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {money(Math.abs(net))}
          </p>
          <p className="text-xs text-muted-foreground">
            {income > 0 ? `${Math.round((net / income) * 100)}% margin` : "no income this period"}
          </p>
        </div>
      </div>

      {/* GST — shaped like a BAS, explicitly not a lodgement */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">GST position</p>
          <p className="text-xs text-muted-foreground">A summary for your accountant — not a BAS lodgement.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Collected on sales (est.)</p>
            <p className="text-lg font-semibold tabular-nums">{money(gstCollected)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid on purchases</p>
            <p className="text-lg font-semibold tabular-nums">{money(gstPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{gstNet >= 0 ? "Likely owed to the ATO" : "Likely refund"}</p>
            <p className="text-lg font-semibold tabular-nums">{money(Math.abs(gstNet))}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Collected GST is estimated as 1/11th of payments received, the standard GST-inclusive fraction. If you make
          GST-free sales it will read high — the paid figure comes from the actual GST on each expense, so that one is exact.
        </p>
      </div>

      {/* Month-by-month, when the period spans more than one */}
      {byMonth.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-4 text-sm font-semibold">Month by month</p>
          <div className="space-y-2.5">
            {byMonth.map((m) => (
              <div key={m.key} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">{m.label}</span>
                <div className="flex-1 space-y-1">
                  <div className="h-2.5 rounded-full bg-emerald-500/70" style={{ width: `${(m.income / maxBar) * 100}%`, minWidth: m.income ? 2 : 0 }} />
                  <div className="h-2.5 rounded-full bg-red-500/60" style={{ width: `${(m.expenses / maxBar) * 100}%`, minWidth: m.expenses ? 2 : 0 }} />
                </div>
                <span className={`w-24 shrink-0 text-right text-xs font-semibold tabular-nums ${m.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {m.net >= 0 ? "+" : "−"}{money(Math.abs(m.net))}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500/70" /> in</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-red-500/60" /> out</span>
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-sm font-semibold">Where it went</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{catLabel(c.category)}</span>
                    <span className="tabular-nums font-medium">{money(c.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(c.total / (byCategory[0]?.total || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-sm font-semibold">Top suppliers</p>
          {byVendor.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {byVendor.map((v) => (
                  <tr key={v.vendor} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 break-words">{v.vendor}</td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground">{v.count}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{money(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
