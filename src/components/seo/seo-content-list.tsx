"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, FileText } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { startContentPipeline, setSeoBudget } from "@/lib/actions/seo-pipeline";
import type { SeoContentType } from "@/types/database";

interface Piece {
  id: string; title: string; topic: string | null; content_type: string;
  pipeline_status: string; current_stage: string | null;
  seo_sites?: { domain: string } | null;
}
interface Props {
  pieces: Piece[];
  sites: { id: string; domain: string }[];
  budget: { spentCents: number; budgetCents: number; ok: boolean };
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STATUS_TONE: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  idle: "bg-muted text-muted-foreground",
};

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SeoContentList({ pieces, sites, budget }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<SeoContentType>("blog");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDollars, setBudgetDollars] = useState(String((budget.budgetCents / 100).toFixed(0)));

  function handleSaveBudget() {
    startTransition(async () => {
      try {
        await setSeoBudget(Math.round(parseFloat(budgetDollars || "0") * 100));
        toast.success("Budget updated");
        setBudgetOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update budget");
      }
    });
  }

  function handleStart() {
    if (!siteId) { toast.error("Add a client site first"); return; }
    if (!topic.trim()) { toast.error("Enter a topic"); return; }
    startTransition(async () => {
      try {
        const { piece_id } = await startContentPipeline({ site_id: siteId, topic, content_type: contentType });
        toast.success("Pipeline started");
        router.push(`/seo/content/${piece_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Content"
        subtitle="Articles and pages moving through the agent pipeline"
        accent="linear-gradient(180deg, #10b981 0%, #047857 100%)"
        actions={
          <>
            <Link href="/seo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5">
              <ArrowLeft className="w-4 h-4" /> Sites
            </Link>
            <Button onClick={() => setOpen(true)} disabled={isPending || sites.length === 0}>
              <Plus className="w-4 h-4 mr-1.5" /> New content
            </Button>
          </>
        }
      />

      {/* Budget strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-2.5 mb-5">
        <div className="text-sm">
          <span className="text-muted-foreground">This month: </span>
          <span className="font-semibold">{money(budget.spentCents)}</span>
          <span className="text-muted-foreground"> of {budget.budgetCents === 0 ? "unlimited" : money(budget.budgetCents)}</span>
          {!budget.ok && <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">budget reached</span>}
        </div>
        <button onClick={() => setBudgetOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline">
          Set budget
        </button>
      </div>

      {sites.length === 0 && (
        <p className="text-sm text-muted-foreground mb-4">Add a client site on the <Link href="/seo" className="underline">Sites</Link> page first.</p>
      )}

      {pieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">No content yet</p>
          <p className="text-sm text-muted-foreground mt-1">Start a piece and the agents research, write, refine and prep it for review.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pieces.map((p) => (
            <Link key={p.id} href={`/seo/content/${p.id}`} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-emerald-400/60 hover:shadow-sm transition-all">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold break-words">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="capitalize">{p.content_type}</span>
                  {p.seo_sites?.domain && <> · {p.seo_sites.domain}</>}
                  {p.current_stage && <> · at {p.current_stage}</>}
                </p>
              </div>
              <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0", STATUS_TONE[p.pipeline_status])}>
                {p.pipeline_status.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start a content piece</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-site">Client site</Label>
              <select id="c-site" className={selectCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-topic">Topic</Label>
              <Input id="c-topic" placeholder="e.g. emergency roof repairs in Parramatta" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-type">Content type</Label>
              <select id="c-type" className={selectCls} value={contentType} onChange={(e) => setContentType(e.target.value as SeoContentType)}>
                <option value="blog">Blog / article</option>
                <option value="landing">Landing / sales page</option>
                <option value="email">Email</option>
                <option value="social">Social</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleStart} disabled={isPending}>Start pipeline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Monthly SEO budget</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="c-budget">Cap ($ per month, 0 = unlimited)</Label>
            <Input id="c-budget" type="number" min={0} value={budgetDollars} onChange={(e) => setBudgetDollars(e.target.value)} />
            <p className="text-xs text-muted-foreground">The agents stop running once the month&apos;s spend reaches this. Currently spent {money(budget.spentCents)}.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBudgetOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleSaveBudget} disabled={isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
