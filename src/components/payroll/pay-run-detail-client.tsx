"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Trash2, CheckCircle } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { updatePayRunLine, finalisePayRun, deletePayRun } from "@/lib/actions/payroll";
import type { PayRun, PayRunLine } from "@/types/database";
import Link from "next/link";

const money = (n: number) => `$${(Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayRunDetailClient({ run: initialRun, lines: initialLines }: { run: PayRun; lines: PayRunLine[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [run, setRun] = useState(initialRun);
  const [lines, setLines] = useState(initialLines);
  const finalised = run.status === "finalised";

  const recalcTotals = (rows: PayRunLine[]) => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    setRun((prev) => ({
      ...prev,
      gross_total: r2(rows.reduce((s, l) => s + Number(l.gross), 0)),
      super_total: r2(rows.reduce((s, l) => s + Number(l.super_amount), 0)),
      tax_total: r2(rows.reduce((s, l) => s + Number(l.tax_amount), 0)),
      net_total: r2(rows.reduce((s, l) => s + Number(l.net), 0)),
    }));
  };

  // Edit a numeric field locally, recompute the line, persist (debounced by blur).
  const editLine = (id: string, field: "hours" | "rate" | "tax_amount" | "super_amount", value: number) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== id) return l;
        const m = { ...l, [field]: value };
        if (l.pay_type === "hourly" && (field === "hours" || field === "rate")) m.gross = Math.round(m.hours * m.rate * 100) / 100;
        m.net = Math.round((m.gross - m.tax_amount) * 100) / 100;
        return m;
      });
      recalcTotals(next);
      return next;
    });
  };

  const persistLine = (id: string) => {
    const l = lines.find((x) => x.id === id);
    if (!l) return;
    start(async () => {
      try {
        await updatePayRunLine(id, { hours: l.hours, rate: l.rate, tax_amount: l.tax_amount, super_amount: l.super_amount });
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    });
  };

  const finalise = async () => {
    if (!(await confirm({ title: "Finalise this pay run?", body: "It locks the run and posts wages + super to Expenses. This can't be edited afterwards.", confirmLabel: "Finalise" }))) return;
    start(async () => {
      try { await finalisePayRun(run.id); setRun((p) => ({ ...p, status: "finalised" })); toast.success("Pay run finalised"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't finalise"); }
    });
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this pay run?", body: finalised ? "The posted wages + super expenses will also be removed." : "This draft will be removed.", confirmLabel: "Delete" }))) return;
    start(async () => {
      try { await deletePayRun(run.id); toast.success("Deleted"); router.push("/payroll"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); }
    });
  };

  const cell = "h-8 w-24 text-right tabular-nums";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/payroll" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Pay run</h1>
            <span className={`ch-pill ${finalised ? "paid" : "draft"}`}>{run.status}</span>
          </div>
          <p className="text-sm text-muted-foreground">{new Date(run.period_start).toLocaleDateString("en-AU")} – {new Date(run.period_end).toLocaleDateString("en-AU")} · paid {new Date(run.pay_date).toLocaleDateString("en-AU")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!finalised && <Button onClick={finalise} disabled={pending}><CheckCircle className="w-4 h-4 mr-1.5" /> Finalise</Button>}
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={pending}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total label="Gross" value={money(run.gross_total)} />
        <Total label="Tax withheld" value={money(run.tax_total)} />
        <Total label="Super" value={money(run.super_total)} />
        <Total label="Net pay" value={money(run.net_total)} emphasis />
      </div>

      <div className="ch-table-wrap">
        <table className="ch-table w-full">
          <thead><tr><th>Employee</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Gross</th><th className="num">Tax</th><th className="num">Super</th><th className="num">Net</th><th></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.name}<span className="ml-2 text-[10px] capitalize text-muted-foreground">{l.pay_type}</span></td>
                <td className="num">{finalised || l.pay_type === "salary" ? l.hours : <Input type="number" step="0.25" className={cell} value={l.hours} onChange={(e) => editLine(l.id, "hours", Number(e.target.value) || 0)} onBlur={() => persistLine(l.id)} />}</td>
                <td className="num">{finalised || l.pay_type === "salary" ? money(l.rate) : <Input type="number" step="0.01" className={cell} value={l.rate} onChange={(e) => editLine(l.id, "rate", Number(e.target.value) || 0)} onBlur={() => persistLine(l.id)} />}</td>
                <td className="num font-medium">{money(l.gross)}</td>
                <td className="num">{finalised ? money(l.tax_amount) : <Input type="number" step="0.01" className={cell} value={l.tax_amount} onChange={(e) => editLine(l.id, "tax_amount", Number(e.target.value) || 0)} onBlur={() => persistLine(l.id)} />}</td>
                <td className="num">{finalised ? money(l.super_amount) : <Input type="number" step="0.01" className={cell} value={l.super_amount} onChange={(e) => editLine(l.id, "super_amount", Number(e.target.value) || 0)} onBlur={() => persistLine(l.id)} />}</td>
                <td className="num font-semibold">{money(l.net)}</td>
                <td><a href={`/api/pdf/payslip/${l.id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Payslip PDF"><FileText className="w-4 h-4" /></a></td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No employees on this run. Add employees on the Payroll page first.</td></tr>}
          </tbody>
        </table>
      </div>

      {!finalised && <p className="text-xs text-muted-foreground">Enter tax withheld per person (PAYG). Hourly gross recalculates from hours × rate. Finalising posts total wages + super to Expenses.</p>}
    </div>
  );
}

function Total({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border border-border p-4 ${emphasis ? "bg-primary/5" : "bg-card"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 tabular-nums ${emphasis ? "text-2xl font-bold" : "text-xl font-semibold"}`}>{value}</p>
    </div>
  );
}
