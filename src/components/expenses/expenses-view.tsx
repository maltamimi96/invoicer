"use client";

import { useConfirm } from "@/components/ui/confirm";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, Plus, Trash2, FileText, Edit, ChevronLeft, ChevronRight, Download } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { createExpense, updateExpense, deleteExpense, createReceiptUpload, getReceiptUrl } from "@/lib/actions/expenses";
import { exportExpensesCsv } from "@/lib/actions/books";
import { BooksPanel } from "./books-panel";
import { KireiTabs } from "@/components/ui/kirei/tabs";
import { PERIOD_LABELS, type PeriodKind } from "@/lib/expenses/period";
import type { BooksSummary } from "@/lib/actions/books";
import { putSignedUpload } from "@/lib/uploads-client";
import type { Expense } from "@/types/database";

interface WO { id: string; number: string | null; title: string | null }
interface Props {
  expenses: Expense[];
  allCount: number;
  books: BooksSummary;
  periodKind: PeriodKind;
  offset: number;
  workOrders: WO[];
}

// Grouped so the dropdown reads as: job costs, overheads/bills, payroll.
const CATEGORY_GROUPS: { label: string; options: string[] }[] = [
  { label: "Job costs", options: ["materials", "subcontractor", "equipment-hire", "permits", "fuel", "vehicle", "travel", "tools"] },
  { label: "Overheads & bills", options: ["rent", "utilities", "insurance", "software", "subscriptions", "phone-internet", "marketing", "accounting", "bank-fees", "office", "tax"] },
  { label: "Payroll", options: ["wages", "superannuation"] },
  { label: "Other", options: ["other"] },
];
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.options);
const catLabel = (c: string) => c.replace(/-/g, " ");
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const woLabel = (w?: WO) => w ? (w.title || w.number || "Job") : null;

const PERIODS: PeriodKind[] = ["day", "week", "month", "quarter", "fy", "all"];

export function ExpensesView({ expenses, allCount, books, periodKind, offset, workOrders }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [category, setCategory] = useState("materials");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [workOrderId, setWorkOrderId] = useState("");
  const [billable, setBillable] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"expenses" | "books">("expenses");

  const woById = new Map(workOrders.map((w) => [w.id, w]));
  const gross = (e: Expense) => Number(e.amount) + Number(e.tax_amount);

  // Everything below is scoped to the selected period, which the server has
  // already aggregated — the client must not re-derive "this month" from a
  // list that may only contain one week.
  const monthTotal = books.expenses;
  const billableTotal = books.billable;

  // Spend by category for the period, biggest first — where the money goes.
  const byCategory: [string, number][] = books.byCategory.map((c) => [c.category, c.total]);

  const visible = filterCategory === "all" ? expenses : expenses.filter((e) => e.category === filterCategory);

  function reset() {
    setAmount(""); setTax(""); setCategory("materials"); setVendor(""); setDescription("");
    setSpentOn(new Date().toISOString().split("T")[0]); setPaymentMethod("card");
    setWorkOrderId(""); setBillable(false); setReceiptPath(null);
    // Critical: without this, "Add expense" after an edit would overwrite the
    // record that was just edited instead of creating a new one.
    setEditingId(null);
  }

  async function onReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const upload = await createReceiptUpload(file.name, file.size);
      await putSignedUpload("expense-receipts", upload, file);
      setReceiptPath(upload.path);
      toast.success("Receipt attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); }
  }

  /** Load an existing expense into the dialog. */
  function startEdit(e: Expense) {
    setEditingId(e.id);
    setAmount(String(e.amount ?? ""));
    setTax(String(e.tax_amount ?? ""));
    setCategory(e.category ?? "materials");
    setVendor(e.vendor ?? "");
    setDescription(e.description ?? "");
    setSpentOn(e.spent_on);
    setPaymentMethod(e.payment_method ?? "card");
    setWorkOrderId(e.work_order_id ?? "");
    setBillable(Boolean(e.billable));
    setReceiptPath(e.receipt_path ?? null);
    setOpen(true);
  }

  function handleSave() {
    if (!amount || Number(amount) <= 0) { toast.error("Enter an amount"); return; }
    startTransition(async () => {
      try {
        const payload = {
          amount, tax_amount: tax, category, vendor, description, spent_on: spentOn,
          payment_method: paymentMethod, work_order_id: workOrderId || null, billable, receipt_path: receiptPath,
        };
        if (editingId) {
          await updateExpense(editingId, payload);
          toast.success("Expense updated");
        } else {
          await createExpense(payload);
          toast.success("Expense recorded");
        }
        setOpen(false); reset(); router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save");
      }
    });
  }

  // Was a bare click on a 16px trash icon sitting next to the view-receipt
  // icon — one misclick permanently destroyed a financial record.
  async function handleDelete(id: string) {
    if (!(await confirm({
      title: "Delete this expense?",
      body: "The expense and its receipt link are permanently removed. This cannot be undone.",
      confirmLabel: "Delete expense",
    }))) return;
    startTransition(async () => {
      try { await deleteExpense(id); toast.success("Deleted"); router.refresh(); }
      catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't delete"); }
    });
  }

  /** Move to another period. The URL is the source of truth, so the server
   *  re-aggregates rather than the client re-filtering a partial list. */
  function go(kind: PeriodKind, next: number) {
    router.push(`/expenses?period=${kind}&offset=${next}`);
  }

  async function handleExport() {
    const csv = await exportExpensesCsv(periodKind, offset);
    const slug = books.period.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function viewReceipt(path: string) {
    const url = await getReceiptUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Receipt unavailable");
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Track job and business costs — receipts, categories and true profit per job"
        actions={
          <>
            <Button variant="outline" disabled={isPending} onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
            <Button onClick={() => { reset(); setOpen(true); }} disabled={isPending}>
              <Plus className="w-4 h-4 mr-1.5" /> Add expense
            </Button>
          </>
        }
      />

      {/* Period navigation — the whole page is scoped to this window, and it
          lives in the URL so a view is shareable and survives a refresh. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {PERIODS.map((k) => (
            <button key={k} onClick={() => go(k, 0)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                periodKind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {PERIOD_LABELS[k]}
            </button>
          ))}
        </div>

        {periodKind !== "all" && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => go(periodKind, offset - 1)} aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center text-sm font-semibold">{books.period.label}</span>
            {/* Can't navigate into the future — there's nothing there. */}
            <Button variant="outline" size="sm" onClick={() => go(periodKind, offset + 1)}
              disabled={offset >= 0} aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {offset !== 0 && <Button variant="ghost" size="sm" onClick={() => go(periodKind, 0)}>Today</Button>}
          </div>
        )}
      </div>

      <KireiTabs className="mb-5" value={tab} onChange={setTab}
        tabs={[
          { value: "expenses", label: "Expenses", count: expenses.length },
          { value: "books", label: "Books" },
        ]} />

      {tab === "books" ? <BooksPanel books={books} /> : <>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label={books.period.label} value={money(monthTotal)} sub={String(books.expenseCount) + " expenses"} />
        <Stat label="Billable (rebillable)" value={money(billableTotal)} />
        <Stat label="All records" value={String(allCount)} />
      </div>

      {/* Where the money went, this month */}
      {byCategory.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Spend by category · {books.period.label}</p>
          <div className="flex flex-wrap gap-2">
            {byCategory.map(([cat, amt]) => {
              const pct = monthTotal > 0 ? Math.round((amt / monthTotal) * 100) : 0;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCategory((f) => (f === cat ? "all" : cat))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                    filterCategory === cat ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-background/50 hover:bg-muted",
                  )}
                >
                  <span className="font-medium capitalize">{catLabel(cat)}</span>
                  <span className="tabular-nums text-muted-foreground">{money(amt)} · {pct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Receipt className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No expenses yet</p>
          <p className="text-sm text-muted-foreground mt-1">Log a cost, attach the receipt, and link it to a job to see real profit per job.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add your first expense</Button>
        </div>
      ) : (
        <>
        <div className="mb-3 flex items-center gap-2">
          <Label htmlFor="e-filter" className="text-xs text-muted-foreground">Filter</Label>
          <select id="e-filter" className={cn(selectCls, "h-8 w-auto")} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </optgroup>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{visible.length} of {expenses.length}</span>
        </div>
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">No {catLabel(filterCategory)} expenses.</p>
        ) : (
        <div className="ch-table-wrap">
          <table className="ch-table w-full">
            <thead><tr>
              <th>Date</th><th>Category</th><th>Vendor</th><th>Job</th><th className="num">Amount</th><th></th><th></th>
            </tr></thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.spent_on).toLocaleDateString("en-AU")}</td>
                  <td><span className="capitalize">{catLabel(e.category)}</span>{e.billable && <span className="ml-2 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">billable</span>}</td>
                  <td className="break-words">{e.vendor ?? "—"}</td>
                  <td>{e.work_order_id ? (woLabel(woById.get(e.work_order_id)) ?? "Job") : "—"}</td>
                  <td className="num">{money(Number(e.amount) + Number(e.tax_amount))}</td>
                  <td>{e.receipt_path && <button onClick={() => viewReceipt(e.receipt_path!)} className="text-muted-foreground hover:text-foreground" title="View receipt"><FileText className="w-4 h-4" /></button>}</td>
                  <td><button onClick={() => startEdit(e)} disabled={isPending} className="text-muted-foreground hover:text-foreground" aria-label="Edit"><Edit className="w-4 h-4" /></button></td>
                  <td><button onClick={() => handleDelete(e.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}
      </>}

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="e-amount">Amount (ex-tax)</Label><Input id="e-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-tax">Tax</Label><Input id="e-tax" type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="e-cat">Category</Label>
                <select id="e-cat" className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((c) => <option key={c} value={c} className="capitalize">{catLabel(c)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="e-date">Date</Label><DatePicker id="e-date" value={spentOn} onChange={setSpentOn} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="e-vendor">Vendor</Label><Input id="e-vendor" placeholder="Bunnings, fuel station…" value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="e-pm">Paid by</Label>
                <select id="e-pm" className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="card">Card</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="e-wo">Link to job</Label>
                <select id="e-wo" className={selectCls} value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)}>
                  <option value="">— No job —</option>
                  {workOrders.map((w) => <option key={w.id} value={w.id}>{woLabel(w)}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="e-desc">Notes</Label><Textarea id="e-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Rebill to the customer</label>
            <div className="space-y-1.5">
              <Label>Receipt</Label>
              <div className="flex items-center gap-2">
                <input type="file" accept="image/*,application/pdf" onChange={onReceipt} className="text-xs" disabled={uploading} />
                {uploading && <span className="text-xs text-muted-foreground">uploading…</span>}
                {receiptPath && <span className="text-xs text-emerald-600">attached ✓</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending || uploading}>{editingId ? "Save changes" : "Save expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
