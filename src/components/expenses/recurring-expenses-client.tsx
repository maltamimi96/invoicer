"use client";

/**
 * Costs that arrive whether or not anyone remembers them — rent, insurance,
 * subscriptions, finance.
 *
 * The point is that a business's real monthly outgoings show up in the books
 * without someone re-typing them twelve times a year. Each schedule posts a
 * normal expense row on its due date, so everything downstream (Spend by
 * category, the books summary, CSV export) works with no changes.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Repeat, Plus, Trash2, Edit, Play, Receipt } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/layout/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CATEGORY_GROUPS, catLabel } from "@/lib/expenses/categories";
import { EXPENSE_CADENCES, type ExpenseCadence } from "@/lib/recurring/expense-schedule";
import {
  saveRecurringExpense, deleteRecurringExpense,
  setRecurringExpenseActive, runRecurringExpenseNow,
  type RecurringExpense,
} from "@/lib/actions/recurring-expenses";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const CADENCE_LABEL: Record<string, string> =
  Object.fromEntries(EXPENSE_CADENCES.map((c) => [c.value, c.label]));

/** What this schedule costs in a year — the number that makes a subscription
 *  list uncomfortable enough to be useful. */
const PER_YEAR: Record<ExpenseCadence, number> = {
  weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1,
};
function annualised(r: RecurringExpense): number {
  return (Number(r.amount) + Number(r.tax_amount)) * PER_YEAR[r.cadence];
}

const today = () => new Date().toISOString().slice(0, 10);

const BLANK: Partial<RecurringExpense> = {
  name: "", vendor: "", category: "subscriptions", description: "",
  amount: 0, tax_amount: 0, payment_method: "card", billable: false,
  cadence: "monthly", preferred_day_of_month: null,
  next_run_on: today(), ends_on: null, active: true,
};

export function RecurringExpensesClient({
  initial, currency,
}: { initial: RecurringExpense[]; currency: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<RecurringExpense>>(BLANK);

  const active = initial.filter((r) => r.active);
  const monthlyRun = active.reduce((sum, r) => sum + annualised(r) / 12, 0);

  function openNew() { setEditing(null); setForm({ ...BLANK }); setOpen(true); }
  function openEdit(r: RecurringExpense) { setEditing(r.id); setForm({ ...r }); setOpen(true); }

  function save() {
    startTransition(async () => {
      const res = await saveRecurringExpense(editing, form);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(editing ? "Saved" : "Recurring cost added");
      setOpen(false);
      router.refresh();
    });
  }

  function toggle(r: RecurringExpense, next: boolean) {
    startTransition(async () => {
      const res = await setRecurringExpenseActive(r.id, next);
      if (!res.ok) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  function postNow(r: RecurringExpense) {
    startTransition(async () => {
      const res = await runRecurringExpenseNow(r.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Posted ${r.name}`);
      router.refresh();
    });
  }

  async function remove(r: RecurringExpense) {
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      body: "The schedule stops. Costs it already posted stay in the books — they really were spent.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteRecurringExpense(r.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Deleted");
      router.refresh();
    });
  }

  const set = <K extends keyof RecurringExpense>(k: K, v: RecurringExpense[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        title="Recurring costs"
        subtitle="Rent, insurance, subscriptions — posted to the books on their due date"
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> New recurring cost</Button>}
      />

      {initial.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Active schedules" value={String(active.length)} />
          <Stat label="Per month" value={money(monthlyRun)} hint={currency} />
          <Stat label="Per year" value={money(monthlyRun * 12)} hint={currency} />
        </div>
      )}

      {initial.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Repeat className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold">No recurring costs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the ones that turn up every month — rent, insurance, phone, software.
            They&rsquo;ll post themselves so your profit figure is honest.
          </p>
          <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4" /> New recurring cost</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {initial.map((r) => (
            <div key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Receipt className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="capitalize">{catLabel(r.category)}</span>
                  {r.vendor && <> · {r.vendor}</>}
                  {" · "}{CADENCE_LABEL[r.cadence] ?? r.cadence}
                  {r.active ? <> · next {r.next_run_on}</> : <> · paused</>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {money(Number(r.amount) + Number(r.tax_amount))}
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">{money(annualised(r))}/yr</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch checked={r.active} onCheckedChange={(v) => toggle(r, v)} disabled={pending}
                  aria-label={r.active ? `Pause ${r.name}` : `Resume ${r.name}`} />
                <Button variant="ghost" size="icon" onClick={() => postNow(r)} disabled={pending}
                  aria-label={`Post ${r.name} now`} title="Post this one now">
                  <Play className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(r)} disabled={pending}
                  aria-label={`Edit ${r.name}`}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(r)} disabled={pending}
                  aria-label={`Delete ${r.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recurring cost" : "New recurring cost"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rx-name">Name</Label>
              <Input id="rx-name" placeholder="Office rent, Xero, public liability…"
                value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rx-amount">Amount (ex-tax)</Label>
                <Input id="rx-amount" type="number" step="0.01" value={String(form.amount ?? "")}
                  onChange={(e) => set("amount", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-tax">Tax</Label>
                <Input id="rx-tax" type="number" step="0.01" value={String(form.tax_amount ?? "")}
                  onChange={(e) => set("tax_amount", Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rx-cat">Category</Label>
                <select id="rx-cat" className={selectCls} value={form.category ?? "subscriptions"}
                  onChange={(e) => set("category", e.target.value)}>
                  {CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((c) => (
                        <option key={c} value={c} className="capitalize">{catLabel(c)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-vendor">Vendor</Label>
                <Input id="rx-vendor" placeholder="Who it goes to"
                  value={form.vendor ?? ""} onChange={(e) => set("vendor", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rx-cadence">Repeats</Label>
                <select id="rx-cadence" className={selectCls} value={form.cadence ?? "monthly"}
                  onChange={(e) => set("cadence", e.target.value as ExpenseCadence)}>
                  {EXPENSE_CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-next">Next due</Label>
                <DatePicker id="rx-next" value={form.next_run_on ?? today()}
                  onChange={(v) => set("next_run_on", v)} />
              </div>
            </div>

            {form.cadence !== "weekly" && form.cadence !== "fortnightly" && (
              <div className="space-y-1.5">
                <Label htmlFor="rx-day">Day of the month (optional)</Label>
                <Input id="rx-day" type="number" min={1} max={31} placeholder="e.g. 1"
                  value={form.preferred_day_of_month == null ? "" : String(form.preferred_day_of_month)}
                  onChange={(e) => set("preferred_day_of_month",
                    e.target.value === "" ? null : Number(e.target.value))} />
                <p className="text-[11px] text-muted-foreground">
                  31 lands on the last day of a short month, not the 3rd of the next one.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rx-pm">Paid by</Label>
                <select id="rx-pm" className={selectCls} value={form.payment_method ?? "card"}
                  onChange={(e) => set("payment_method", e.target.value)}>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-ends">Ends on (optional)</Label>
                <DatePicker id="rx-ends" value={form.ends_on ?? ""}
                  onChange={(v) => set("ends_on", v || null)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
