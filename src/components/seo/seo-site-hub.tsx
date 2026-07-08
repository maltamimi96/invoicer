"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, FileText, Search, Globe, Plug, Activity } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { startContentPipeline } from "@/lib/actions/seo-pipeline";
import { SeoActivityTerminal } from "@/components/seo/seo-activity-terminal";
import { SeoConnections } from "@/components/seo/seo-connections";
import { CONNECTORS, type ConnectionView } from "@/lib/seo/connectors";
import type { SeoSite, SeoContentType } from "@/types/database";

interface Piece {
  id: string; title: string; topic: string | null; content_type: string;
  status: string; pipeline_status: string; current_stage: string | null; created_at: string;
}
interface Props {
  site: SeoSite & { seo_sites?: unknown };
  pieces: Piece[];
  connections: ConnectionView[];
  budget: { spentCents: number; budgetCents: number; ok: boolean };
}

type Tab = "overview" | "content" | "connections" | "activity";

const STATUS_TONE: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  queued: "bg-muted text-muted-foreground",
  idle: "bg-muted text-muted-foreground",
};
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function SeoSiteHub({ site, pieces, connections, budget }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<SeoContentType>("blog");

  const connectedCount = connections.filter((c) => c.status === "connected").length;
  const approvedCount = pieces.filter((p) => p.status === "approved" || p.pipeline_status === "done").length;

  function handleStart() {
    if (!topic.trim()) { toast.error("Enter a topic"); return; }
    startTransition(async () => {
      try {
        const { piece_id } = await startContentPipeline({ site_id: site.id, topic, content_type: contentType });
        toast.success("Pipeline started");
        router.push(`/seo/content/${piece_id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start");
      }
    });
  }

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "overview", label: "Overview", icon: Globe },
    { id: "content", label: "Content", icon: FileText },
    { id: "connections", label: "Connections", icon: Plug },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <>
      <PageHeader
        title={site.domain}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap capitalize">
            <span>{site.platform}</span><span>· {site.playbook}</span>
            <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5", STATUS_TONE[site.status] ?? "bg-muted text-muted-foreground")}>{site.status}</span>
          </span>
        }
        accent="linear-gradient(180deg, #10b981 0%, #047857 100%)"
        actions={
          <>
            <Link href="/seo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5">
              <ArrowLeft className="w-4 h-4" /> Sites
            </Link>
            <Button onClick={() => setOpen(true)} disabled={isPending}><Plus className="w-4 h-4 mr-1.5" /> New content</Button>
          </>
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6 -mt-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap",
              tab === t.id ? "border-emerald-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Content pieces" value={String(pieces.length)} />
            <Stat label="Approved" value={String(approvedCount)} />
            <Stat label="Connectors" value={`${connectedCount} / ${CONNECTORS.length}`} />
            <Stat label="Spend this month" value={money(budget.spentCents)} sub={budget.budgetCents === 0 ? "unlimited" : `of ${money(budget.budgetCents)}`} />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold mb-1">Get to work on {site.domain}</p>
            <p className="text-sm text-muted-foreground mb-3">Start a content piece and the agent pipeline researches, writes and preps it for review. Connect Search Console for real ranking data.</p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New content</Button>
              <Button variant="outline" onClick={() => setTab("connections")}><Plug className="w-4 h-4 mr-1.5" /> Connections</Button>
              <Link href="/seo/pipeline" className="inline-flex items-center gap-1.5 text-sm rounded-md border border-border px-3 py-2 hover:bg-muted"><Search className="w-4 h-4" /> How the pipeline works</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {tab === "content" && (
        pieces.length === 0 ? (
          <EmptyState icon={FileText} title="No content yet" body="Start a piece — the agents research, write, refine and prep it for review." cta={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New content</Button>} />
        ) : (
          <div className="flex flex-col gap-2">
            {pieces.map((p) => (
              <Link key={p.id} href={`/seo/content/${p.id}`} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:border-emerald-400/60 hover:shadow-sm transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold break-words">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">{p.content_type}{p.current_stage && <span className="normal-case"> · at {p.current_stage}</span>}</p>
                </div>
                <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0", STATUS_TONE[p.pipeline_status])}>{p.pipeline_status.replace("_", " ")}</span>
              </Link>
            ))}
          </div>
        )
      )}

      {/* ── Connections ── */}
      {tab === "connections" && <SeoConnections siteId={site.id} connections={connections} />}

      {/* ── Activity ── */}
      {tab === "activity" && <SeoActivityTerminal siteId={site.id} />}

      {/* New content dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New content for {site.domain}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="h-topic">Topic</Label>
              <Input id="h-topic" placeholder="e.g. emergency roof repairs in Parramatta" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-type">Content type</Label>
              <select id="h-type" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" value={contentType} onChange={(e) => setContentType(e.target.value as SeoContentType)}>
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
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, cta }: { icon: typeof FileText; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Icon className="w-6 h-6 text-muted-foreground" /></div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
