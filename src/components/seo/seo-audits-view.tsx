"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Copy, Search, ExternalLink, Download, Play } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { runAuditNow } from "@/lib/actions/seo-audits";

interface Audit { id: string; url: string; email: string | null; name: string | null; status: string; score: number | null; lead_id: string | null; created_at: string }
interface Props { link: string; audits: Audit[] }

const TONE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function SeoAuditsView({ link, audits }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true); toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function runAudit(a: Audit) {
    setRunningId(a.id);
    runAuditNow(a.id)
      .then((r) => { toast.success(`Audit scored ${r.score}/100`); router.refresh(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Audit failed"))
      .finally(() => setRunningId(null));
  }

  return (
    <>
      <PageHeader
        title="Audit tool"
        subtitle="A free-SEO-audit lead magnet — share the link, prospects who submit become leads."
        accent="linear-gradient(180deg, #10b981 0%, #047857 100%)"
        actions={
          <Link href="/seo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5">
            <ArrowLeft className="w-4 h-4" /> Sites
          </Link>
        }
      />

      {/* Shareable link */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <p className="text-sm font-semibold mb-2">Your public audit link</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-0 text-xs bg-muted rounded-md px-3 py-2 break-all">{link}</code>
          <button onClick={copy} className="inline-flex items-center gap-1.5 text-sm rounded-md border border-border px-3 py-2 hover:bg-muted">
            <Copy className="w-4 h-4" /> {copied ? "Copied" : "Copy"}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm rounded-md border border-border px-3 py-2 hover:bg-muted">
            <ExternalLink className="w-4 h-4" /> Open
          </a>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Put it on your site, in your bio, or in outreach. Each submission creates a lead and (once agents are running) emails a branded audit report.</p>
      </div>

      {audits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Search className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No audit requests yet</p>
          <p className="text-sm text-muted-foreground mt-1">Share your link — requests show up here and in Leads.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {audits.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold break-words">{a.url}</p>
                <p className="text-xs text-muted-foreground">{a.name || a.email}{a.name && a.email ? ` · ${a.email}` : ""} · {new Date(a.created_at).toLocaleDateString("en-AU")}</p>
              </div>
              {a.score != null && <span className="text-xs font-semibold">{a.score}/100</span>}
              <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0", TONE[a.status])}>{a.status}</span>
              {(a.status === "queued" || a.status === "failed") && (
                <button onClick={() => runAudit(a)} disabled={isPending || runningId === a.id} className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
                  <Play className="w-3.5 h-3.5" /> {runningId === a.id ? "Running…" : "Run"}
                </button>
              )}
              {a.status === "done" && (
                <a href={`/api/pdf/seo-audit/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"><Download className="w-3.5 h-3.5" /> PDF</a>
              )}
              {a.lead_id && <Link href={`/leads/${a.lead_id}`} className="text-xs text-primary hover:underline shrink-0">Lead</Link>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
