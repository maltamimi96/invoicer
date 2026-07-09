"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { setMemberRate } from "@/lib/actions/timesheets";

interface TimesheetRow {
  user_id: string; member_id: string | null; name: string; hourly_rate: number | null;
  days: number[]; hours: number; pay: number;
}
interface Data { week_start: string; week_end: string; rows: TimesheetRow[]; total_hours: number; total_pay: number }
interface Props { data: Data; prevWeek: string; nextWeek: string }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const money = (n: number) => `$${n.toFixed(2)}`;
const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-AU", { day: "2-digit", month: "short", timeZone: "UTC" });

export function TimesheetsView({ data, prevWeek, nextWeek }: Props) {
  const router = useRouter();
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(data.rows.filter((r) => r.member_id).map((r) => [r.member_id as string, r.hourly_rate != null ? String(r.hourly_rate) : ""])),
  );

  function saveRate(memberId: string) {
    const v = rates[memberId];
    setMemberRate(memberId, v === "" ? null : Number(v))
      .then(() => { toast.success("Rate saved"); router.refresh(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save"));
  }

  function exportCsv() {
    const header = ["Worker", ...DAYS, "Total hours", "Rate", "Pay"];
    const lines = data.rows.map((r) => [r.name, ...r.days.map((h) => h.toFixed(2)), r.hours.toFixed(2), r.hourly_rate ?? "", r.pay.toFixed(2)]);
    const csv = [header, ...lines, ["Total", "", "", "", "", "", "", "", data.total_hours.toFixed(2), "", data.total_pay.toFixed(2)]]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `timesheet-${data.week_start}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Timesheets"
        subtitle="Hours per worker from job time — pay + CSV export"
        actions={
          data.rows.length > 0 && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 text-sm rounded-md border border-border px-3 py-1.5 hover:bg-muted">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )
        }
      />

      {/* Week nav */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <Link href={`/timesheets?week=${prevWeek}`} className="inline-flex items-center gap-1 text-sm rounded-md border border-border px-3 py-1.5 hover:bg-muted"><ChevronLeft className="w-4 h-4" /> Prev</Link>
        <div className="text-sm font-semibold">{fmt(data.week_start)} – {fmt(data.week_end)}</div>
        <Link href={`/timesheets?week=${nextWeek}`} className="inline-flex items-center gap-1 text-sm rounded-md border border-border px-3 py-1.5 hover:bg-muted">Next <ChevronRight className="w-4 h-4" /></Link>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <p className="font-semibold">No time logged this week</p>
          <p className="text-sm text-muted-foreground mt-1">Hours logged on jobs (work + travel) roll up here per worker. Set an hourly rate to calculate pay.</p>
        </div>
      ) : (
        <div className="ch-table-wrap">
          <table className="ch-table w-full">
            <thead><tr>
              <th>Worker</th>{DAYS.map((d) => <th key={d} className="num">{d}</th>)}<th className="num">Hours</th><th className="num">Rate</th><th className="num">Pay</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.user_id}>
                  <td className="break-words font-medium">{r.name}</td>
                  {r.days.map((h, i) => <td key={i} className="num">{h ? h.toFixed(1) : "—"}</td>)}
                  <td className="num font-semibold">{r.hours.toFixed(2)}</td>
                  <td className="num">
                    {r.member_id ? (
                      <input type="number" step="0.01" value={rates[r.member_id] ?? ""} onChange={(e) => setRates((p) => ({ ...p, [r.member_id as string]: e.target.value }))} onBlur={() => saveRate(r.member_id as string)} className="w-16 h-7 text-right rounded border border-input bg-background px-1 text-xs" placeholder="—" />
                    ) : (r.hourly_rate ?? "—")}
                  </td>
                  <td className="num">{r.hourly_rate != null ? money(r.pay) : "—"}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-border">
                <td>Total</td><td colSpan={7}></td><td className="num">{data.total_hours.toFixed(2)}</td><td></td><td className="num">{money(data.total_pay)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
