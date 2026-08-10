"use client";

import { useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Sparkles, Plus, ChevronDown, ChevronRight } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scanOpportunities, writeOpportunity, setOpportunityStatus } from "@/lib/actions/seo-pipeline";

interface Opp { id: string; type: string; title: string; detail: string | null; priority: number; status: string; created_at: string }

const TYPE_TONE: Record<string, string> = {
  quick_win: "bg-emerald-50 text-emerald-700",
  content_gap: "bg-blue-50 text-blue-700",
  question: "bg-violet-50 text-violet-700",
  technical: "bg-amber-50 text-amber-700",
  refresh: "bg-slate-100 text-slate-700",
};

export function SeoOpportunities({ siteId, opportunities }: { siteId: string; opportunities: Opp[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [scanning, setScanning] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function handleScan() {
    setScanning(true);
    scanOpportunities(siteId)
      .then((r) => { toast.success(r.inserted ? `Found ${r.inserted} opportunities` : "No new opportunities"); refresh(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Scan failed"))
      .finally(() => setScanning(false));
  }

  function handleWrite(o: Opp) {
    startTransition(async () => {
      try {
        const { piece_id } = await writeOpportunity(o.id, siteId);
        toast.success("Pipeline started");
        router.push(`/seo/content/${piece_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start");
      }
    });
  }

  function handleStatus(o: Opp, status: string) {
    startTransition(async () => {
      try { await setOpportunityStatus(o.id, status, siteId); refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
    });
  }

  const active = opportunities.filter((o) => o.status !== "dismissed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">The scout studies the niche and ranks what to write or fix. Click <strong>Write this</strong> to send one into the pipeline.</p>
        <Button onClick={handleScan} disabled={scanning || isPending}>
          <Sparkles className="w-4 h-4 mr-1.5" /> {scanning ? "Scanning…" : "Scan for opportunities"}
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Search className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No opportunities yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Run a scan and the scout returns a ranked queue of content gaps, quick wins and questions to target.</p>
          <Button className="mt-4" onClick={handleScan} disabled={scanning}><Sparkles className="w-4 h-4 mr-1.5" /> {scanning ? "Scanning…" : "Scan now"}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((o) => {
            const expanded = openId === o.id;
            const done = o.status !== "queued";
            return (
              <div key={o.id} className={cn("rounded-xl border bg-card", done ? "border-border opacity-70" : "border-border")}>
                <div className="p-4 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0" title="priority">{o.priority}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold break-words">{o.title}</p>
                      <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5", TYPE_TONE[o.type] ?? "bg-muted text-muted-foreground")}>{o.type.replace("_", " ")}</span>
                      {o.status !== "queued" && <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">{o.status.replace("_", " ")}</span>}
                    </div>
                    {o.detail && (
                      <button onClick={() => setOpenId(expanded ? null : o.id)} className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} why
                      </button>
                    )}
                    {expanded && o.detail && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{o.detail}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {o.status === "queued" && (
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleWrite(o)} disabled={isPending}><Plus className="w-3.5 h-3.5 mr-1" /> Write this</Button>
                    )}
                    <button onClick={() => handleStatus(o, "dismissed")} disabled={isPending} className="text-xs text-muted-foreground hover:text-foreground underline px-1">Dismiss</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
