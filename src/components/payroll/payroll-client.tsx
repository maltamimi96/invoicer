"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, DollarSign, Users, ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createPayRun, createEmployee, updateEmployee, deleteEmployee } from "@/lib/actions/payroll";
import type { PayRun, PayrollEmployee, PayType } from "@/types/database";

export interface LinkableMember { id: string; name: string | null; email: string | null; hourly_rate: number | null }

const money = (n: number) => `$${(Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

function today() { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0]; }

export function PayrollClient({ payRuns, employees, members }: { payRuns: PayRun[]; employees: PayrollEmployee[]; members: LinkableMember[] }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [pending, start] = useTransition();
  const [runOpen, setRunOpen] = useState(false);
  const [empModal, setEmpModal] = useState<{ open: boolean; employee?: PayrollEmployee }>({ open: false });

  const [ps, setPs] = useState(daysAgo(13));
  const [pe, setPe] = useState(today());
  const [pd, setPd] = useState(today());

  const activeEmployees = employees.filter((e) => e.active).length;

  const newRun = () => {
    start(async () => {
      try {
        const run = await createPayRun({ period_start: ps, period_end: pe, pay_date: pd });
        toast.success("Pay run created");
        setRunOpen(false);
        router.push(`/payroll/${run.id}`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create pay run"); }
    });
  };

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Run pay from timesheet hours — super, payslips, and wages posted to expenses"
        actions={<Button onClick={() => setRunOpen(true)} disabled={pending}><Plus className="w-4 h-4 mr-1.5" /> New pay run</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={<Users className="w-4 h-4" />} label="Employees" value={String(activeEmployees)} />
        <Stat icon={<DollarSign className="w-4 h-4" />} label="Pay runs" value={String(payRuns.length)} />
        <Stat icon={<DollarSign className="w-4 h-4" />} label="Last net" value={payRuns[0] ? money(payRuns[0].net_total) : "—"} />
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Pay runs</TabsTrigger>
          <TabsTrigger value="employees">Employees ({employees.length})</TabsTrigger>
        </TabsList>

        {/* Pay runs */}
        <TabsContent value="runs" className="mt-3">
          {payRuns.length === 0 ? (
            <Empty text="No pay runs yet. Create one to pull hours and pay your team." onAdd={() => setRunOpen(true)} addLabel="New pay run" />
          ) : (
            <div className="ch-table-wrap">
              <table className="ch-table w-full">
                <thead><tr><th>Pay date</th><th>Period</th><th>Status</th><th className="num">Gross</th><th className="num">Super</th><th className="num">Net</th><th></th></tr></thead>
                <tbody>
                  {payRuns.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/payroll/${r.id}`)}>
                      <td>{new Date(r.pay_date).toLocaleDateString("en-AU")}</td>
                      <td className="text-muted-foreground">{new Date(r.period_start).toLocaleDateString("en-AU")} – {new Date(r.period_end).toLocaleDateString("en-AU")}</td>
                      <td><span className={`ch-pill ${r.status === "finalised" ? "paid" : "draft"}`}>{r.status}</span></td>
                      <td className="num">{money(r.gross_total)}</td>
                      <td className="num">{money(r.super_total)}</td>
                      <td className="num font-semibold">{money(r.net_total)}</td>
                      <td><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Employees */}
        <TabsContent value="employees" className="mt-3">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEmpModal({ open: true })}><Plus className="w-3.5 h-3.5" /> Add employee</Button>
          </div>
          {employees.length === 0 ? (
            <Empty text="Add your team members with their pay rate to run payroll." onAdd={() => setEmpModal({ open: true })} addLabel="Add employee" />
          ) : (
            <div className="ch-table-wrap">
              <table className="ch-table w-full">
                <thead><tr><th>Name</th><th>Type</th><th className="num">Rate / Salary</th><th className="num">Super</th><th></th></tr></thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className={`cursor-pointer ${!e.active ? "opacity-50" : ""}`} onClick={() => setEmpModal({ open: true, employee: e })}>
                      <td className="font-medium">{e.name}{!e.active && <span className="ml-2 text-[10px] text-muted-foreground">(archived)</span>}</td>
                      <td className="capitalize">{e.pay_type}</td>
                      <td className="num">{e.pay_type === "hourly" ? `${money(e.hourly_rate)}/hr` : `${money(e.annual_salary)}/yr`}</td>
                      <td className="num">{e.super_rate}%</td>
                      <td><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New pay run dialog */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New pay run</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={ps} onChange={(e) => setPs(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={pe} onChange={(e) => setPe(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Pay date</Label><Input type="date" value={pd} onChange={(e) => setPd(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">A line is created per active employee — hourly staff seeded from logged hours, salaried pro-rated. You can adjust everything before finalising.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRunOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={newRun} disabled={pending}>{pending ? "Creating…" : "Create pay run"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee dialog */}
      {empModal.open && (
        <EmployeeModal
          employee={empModal.employee}
          members={members}
          onClose={() => setEmpModal({ open: false })}
          onSaved={() => { setEmpModal({ open: false }); refresh(); }}
        />
      )}
    </>
  );
}

function EmployeeModal({ employee, members, onClose, onSaved }: { employee?: PayrollEmployee; members: LinkableMember[]; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [memberId, setMemberId] = useState(employee?.member_profile_id ?? "");
  const [payType, setPayType] = useState<PayType>(employee?.pay_type ?? "hourly");
  const [rate, setRate] = useState(String(employee?.hourly_rate ?? ""));
  const [salary, setSalary] = useState(String(employee?.annual_salary ?? ""));
  const [superRate, setSuperRate] = useState(String(employee?.super_rate ?? 11.5));

  const save = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    start(async () => {
      try {
        if (employee) {
          await updateEmployee(employee.id, {
            name: name.trim(), email: email.trim() || null, member_profile_id: memberId || null,
            pay_type: payType, hourly_rate: Number(rate) || 0, annual_salary: Number(salary) || 0, super_rate: Number(superRate) || 0,
          });
          toast.success("Employee updated");
        } else {
          await createEmployee({
            name, email, member_profile_id: memberId || null, pay_type: payType,
            hourly_rate: Number(rate) || 0, annual_salary: Number(salary) || 0, super_rate: Number(superRate) || 11.5,
          });
          toast.success("Employee added");
        }
        onSaved();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    });
  };

  const onPickMember = (id: string) => {
    setMemberId(id);
    const m = members.find((x) => x.id === id);
    if (m) {
      if (!name.trim()) setName(m.name ?? "");
      if (!email.trim()) setEmail(m.email ?? "");
      if ((!rate || rate === "0") && m.hourly_rate != null) setRate(String(m.hourly_rate));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Link to team member</Label>
            <select className={selectCls} value={memberId} onChange={(e) => onPickMember(e.target.value)}>
              <option value="">— Not linked —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email || "Team member"}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">Linking pulls this person&apos;s logged hours into pay runs.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Pay type</Label>
              <select className={selectCls} value={payType} onChange={(e) => setPayType(e.target.value as PayType)}>
                <option value="hourly">Hourly</option><option value="salary">Salary</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Super %</Label><Input type="number" step="0.1" value={superRate} onChange={(e) => setSuperRate(e.target.value)} /></div>
          </div>
          {payType === "hourly" ? (
            <div className="space-y-1.5"><Label>Hourly rate</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          ) : (
            <div className="space-y-1.5"><Label>Annual salary</Label><Input type="number" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {employee && employee.active && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={pending}
              onClick={() => start(async () => { try { await deleteEmployee(employee.id); toast.success("Archived"); onSaved(); } catch { toast.error("Couldn't archive"); } })}>
              Archive
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{employee ? "Save" : "Add employee"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><span className="text-primary">{icon}</span><p className="text-[11px] font-semibold uppercase tracking-wider">{label}</p></div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ text, onAdd, addLabel }: { text: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button className="mt-4" onClick={onAdd}><Plus className="w-4 h-4 mr-1.5" /> {addLabel}</Button>
    </div>
  );
}
