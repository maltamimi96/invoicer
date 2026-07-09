"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Check, Trash2, Download, Send } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateSeoReport, approveSeoReport, deleteSeoReport, sendSeoReport } from "@/lib/actions/seo-reports";

interface Report { id: string; title: string | null; period_start: string; period_end: string; status: string; created_at: string; sent_at: string | null }

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-emerald-100 text-emerald-700",
  sent: "bg-blue-100 text-blue-700",
};
const fmt = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

export function SeoReports({ siteId, reports }: { siteId: string; reports: Report[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    generateSeoReport(siteId)
      .then(() => { toast.success("Report generated"); router.refresh(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't generate"))
      .finally(() => setGenerating(false));
  }

  function handleApprove(r: Report) {
    startTransition(async () => {
      try { await approveSeoReport(r.id, siteId); toast.success("Approved"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't approve"); }
    });
  }

  function handleDelete(r: Report) {
    startTransition(async () => {
      try { await deleteSeoReport(r.id, siteId); toast.success("Deleted"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete"); }
    });
  }

  function handleSend(r: Report) {
    startTransition(async () => {
      try { await sendSeoReport(r.id, siteId); toast.success("Sent to client"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">Monthly client report — rankings movement, work delivered and next-period plan, as a branded PDF.</p>
        <Button onClick={handleGenerate} disabled={generating || isPending}>
          <Plus className="w-4 h-4 mr-1.5" /> {generating ? "Generating…" : "Generate report"}
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><FileText className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No reports yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Generate a report and it pulls the last 30 days of rankings, content shipped and the upcoming plan into a client-ready PDF.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold break-words">{fmt(r.period_start)} – {fmt(r.period_end)}</p>
                <p className="text-xs text-muted-foreground">Generated {new Date(r.created_at).toLocaleDateString("en-AU")}</p>
              </div>
              <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0", TONE[r.status])}>{r.status}</span>
              <a href={`/api/pdf/seo-report/${r.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border px-2 py-1">
                <Download className="w-3.5 h-3.5" /> PDF
              </a>
              {r.status === "draft" && (
                <button onClick={() => handleApprove(r)} disabled={isPending} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"><Check className="w-3.5 h-3.5" /> Approve</button>
              )}
              {(r.status === "approved" || r.status === "sent") && (
                <button onClick={() => handleSend(r)} disabled={isPending} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Send className="w-3.5 h-3.5" /> {r.status === "sent" ? "Resend" : "Send"}</button>
              )}
              <button onClick={() => handleDelete(r)} disabled={isPending} className="text-muted-foreground hover:text-destructive" aria-label="Delete report"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
