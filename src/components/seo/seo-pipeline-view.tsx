"use client";

import { useState } from "react";
import { ChevronRight, ArrowLeft, X } from "@/components/ui/icons";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  CONTENT_PIPELINE, SEO_AGENTS_BY_ID, SEO_ARTIFACTS, SEO_AGENTS,
  type SeoAgentDef,
} from "@/lib/seo/pipeline";

export function SeoPipelineView() {
  const [selected, setSelected] = useState<SeoAgentDef | null>(null);
  const auditor = SEO_AGENTS_BY_ID["technical-seo-auditor"];

  return (
    <>
      <PageHeader
        title="Content pipeline"
        subtitle="13 SEO agents, from finding what to write to publishing it live"
        accent="linear-gradient(180deg, #10b981 0%, #047857 100%)"
        actions={
          <Link
            href="/seo"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Client sites
          </Link>
        }
      />

      <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
        Each agent hands its work to the next. Discovery decides <em>what</em> to work on; the
        pipeline then researches, writes, refines and ships one piece. Click any agent to see
        what it takes in and what it produces.
      </p>

      {/* Flow — horizontal scroll on small screens */}
      <div className="overflow-x-auto pb-4 -mx-1 px-1">
        <div className="flex items-stretch gap-2 min-w-max">
          {CONTENT_PIPELINE.map((col, ci) => (
            <div key={col.stage} className="flex items-stretch gap-2">
              <div className="flex flex-col gap-2 w-56">
                {/* Column header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                    {ci + 1}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {col.title}
                  </span>
                  {col.parallel && <span className="text-[10px] text-muted-foreground">parallel</span>}
                  {col.branch && <span className="text-[10px] text-muted-foreground">1 of 3</span>}
                </div>
                {/* Agent cards */}
                <div className="flex flex-col gap-2 flex-1">
                  {col.agents.map((id) => {
                    const a = SEO_AGENTS_BY_ID[id];
                    return (
                      <button
                        key={id}
                        onClick={() => setSelected(a)}
                        className={cn(
                          "text-left rounded-xl border bg-card p-3 hover:border-emerald-400/60 hover:shadow-sm transition-all",
                          selected?.id === id ? "border-emerald-500 shadow-sm" : "border-border"
                        )}
                      >
                        <p className="text-sm font-semibold leading-tight break-words">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{a.role}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {a.produces.map((p) => (
                            <span key={p} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full px-1.5 py-0.5">
                              {SEO_ARTIFACTS[p].label}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                  {col.branch && (
                    <p className="text-[10px] text-muted-foreground px-1">Picked by content type (blog / landing / email·social)</p>
                  )}
                  {col.stage === "edit" && (
                    <p className="text-[10px] text-amber-600 px-1">Rejects loop back to Draft ↺</p>
                  )}
                </div>
              </div>

              {/* Connector arrow */}
              {ci < CONTENT_PIPELINE.length - 1 && (
                <div className="flex items-center pt-7 text-muted-foreground/50">
                  <ChevronRight className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Standalone audit track */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Runs on its own</h2>
        <button
          onClick={() => setSelected(auditor)}
          className="text-left rounded-xl border border-border bg-card p-4 hover:border-emerald-400/60 hover:shadow-sm transition-all w-full sm:max-w-md"
        >
          <p className="text-sm font-semibold">{auditor.name}</p>
          <p className="text-xs text-muted-foreground mt-1">{auditor.role}</p>
        </button>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-md h-full bg-card border-l border-border shadow-xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-lg font-bold">{selected.name}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{selected.stage} · {selected.track}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-foreground/90 mb-5">{selected.role}</p>

            <DetailRow label="Takes in">
              {selected.consumes.length
                ? selected.consumes.map((c) => SEO_ARTIFACTS[c].label).join(", ")
                : "Nothing — it starts the flow"}
            </DetailRow>
            <DetailRow label="Produces">
              <div className="flex flex-wrap gap-1.5">
                {selected.produces.map((p) => (
                  <span key={p} className="text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                    {SEO_ARTIFACTS[p].label} <span className="text-emerald-500/70">({SEO_ARTIFACTS[p].file})</span>
                  </span>
                ))}
              </div>
            </DetailRow>
            <DetailRow label="Then hands to">
              {selected.feeds.length
                ? selected.feeds.map((f) => SEO_AGENTS_BY_ID[f]?.name).filter(Boolean).join(", ")
                : "End of the line"}
            </DetailRow>
            {selected.tools.length > 0 && (
              <DetailRow label="Tools">{selected.tools.join(", ")}</DetailRow>
            )}
            <DetailRow label="Model">{selected.model === "opus" ? "Opus (strategy)" : "Sonnet"}</DetailRow>

            <p className="text-[11px] text-muted-foreground mt-6 border-t border-border pt-4">
              Agent {SEO_AGENTS.findIndex((a) => a.id === selected.id) + 1} of {SEO_AGENTS.length}. Prompt lives at
              <code className="mx-1 px-1 rounded bg-muted">src/lib/seo/agents/{selected.id}.md</code>
              and runs as a job step once the engine ships.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <div className="text-sm text-foreground/90">{children}</div>
    </div>
  );
}
