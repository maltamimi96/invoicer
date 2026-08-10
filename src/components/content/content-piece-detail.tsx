"use client";

/**
 * Where the pipeline's output becomes something a person can use.
 *
 * Until now a finished piece showed as "awaiting approval" and nothing else —
 * the variations existed in the table with no way to read, copy, or judge them.
 * Two views:
 *   - Variations: the fan-out (angle × platform), which is the deliverable.
 *   - Working: each agent's artifact, for when you want to see the reasoning.
 */

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronDown, ChevronRight, X, Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ArtifactBody, CopyButton } from "@/components/ui/artifact-body";
import { PLATFORMS, executableSteps, type ContentKind } from "@/lib/content/pipeline";
import { setVariationStatus } from "@/lib/actions/content";
import type { ContentPiece, ContentVariation } from "@/types/database";

const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

/** Everything the agents put in `assets` that isn't already hook/body. */
function Assets({ assets }: { assets: Record<string, unknown> }) {
  const tags = Array.isArray(assets.hashtags) ? (assets.hashtags as string[]) : [];
  const beats = Array.isArray(assets.beats) ? (assets.beats as Array<Record<string, unknown>>) : [];
  const cta = typeof assets.cta === "string" ? assets.cta : null;
  const first = typeof assets.first_comment === "string" ? assets.first_comment : null;

  return (
    <>
      {beats.length > 0 && (
        <ol className="space-y-1.5 border-t pt-2">
          {beats.map((b, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <span className="text-[10px] text-muted-foreground w-3 shrink-0 mt-0.5">{i + 1}</span>
              <div className="min-w-0">
                <p className="font-medium break-words">{String(b.shot ?? "")}</p>
                {b.vo ? <p className="text-muted-foreground break-words">“{String(b.vo)}”</p> : null}
                {b.on_screen ? (
                  <p className="text-[10px] mt-0.5">
                    <span className="rounded bg-muted px-1 py-0.5">on-screen: {String(b.on_screen)}</span>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {cta && (
        <p className="text-xs border-t pt-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">CTA</span> {cta}
        </p>
      )}
      {tags.length > 0 && (
        <p className="text-[11px] text-primary break-words">
          {tags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
        </p>
      )}
      {first && (
        <p className="text-[11px] text-muted-foreground border-t pt-2 break-words">
          <span className="uppercase tracking-wide">First comment</span> — {first}
        </p>
      )}
    </>
  );
}

/** The full text of a variation, in the form you'd paste into the platform. */
function plain(v: ContentVariation): string {
  const beats = Array.isArray(v.assets.beats) ? (v.assets.beats as Array<Record<string, unknown>>) : [];
  const tags = Array.isArray(v.assets.hashtags) ? (v.assets.hashtags as string[]) : [];
  return [
    v.hook,
    ...beats.map((b, i) => `${i + 1}. [${b.shot}] ${b.vo ?? ""}${b.on_screen ? ` (text: ${b.on_screen})` : ""}`),
    v.body,
    v.assets.cta ? `CTA: ${v.assets.cta}` : null,
    tags.length ? tags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function VariationCard({ v, onSet, busy }: {
  v: ContentVariation;
  onSet: (id: string, s: "approved" | "rejected" | "draft") => void;
  busy: boolean;
}) {
  const rejected = v.status === "rejected";
  return (
    <div className={`rounded-xl border bg-card p-3 space-y-2 ${rejected ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {platformLabel(v.platform)}
        </span>
        <div className="flex items-center gap-1">
          <CopyButton text={plain(v)} />
          <button
            disabled={busy}
            onClick={() => onSet(v.id, v.status === "approved" ? "draft" : "approved")}
            title={v.status === "approved" ? "Approved — click to undo" : "Approve"}
            className={`rounded-md border p-1 transition-colors ${
              v.status === "approved"
                ? "border-green-500/40 bg-green-500/10 text-green-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            disabled={busy}
            onClick={() => onSet(v.id, rejected ? "draft" : "rejected")}
            title={rejected ? "Rejected — click to undo" : "Reject"}
            className={`rounded-md border p-1 transition-colors ${
              rejected ? "border-destructive/40 bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {v.hook && <p className="text-sm font-medium break-words">“{v.hook}”</p>}
      {v.body && <p className="text-xs whitespace-pre-wrap break-words">{v.body}</p>}
      <Assets assets={v.assets} />
    </div>
  );
}

export function ContentPieceDetail({
  piece,
  variations,
  brandName,
}: {
  piece: ContentPiece;
  variations: ContentVariation[];
  brandName: string;
}) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"variations" | "working">("variations");
  const [open, setOpen] = useState<string | null>(null);

  // Still running: the variations land at the adapt step, so the page has to
  // catch up on its own rather than sit empty.
  useEffect(() => {
    if (piece.status !== "running") return;
    const t = setInterval(() => refresh(), 5000);
    return () => clearInterval(t);
  }, [piece.status, router]);

  const set = (id: string, status: "approved" | "rejected" | "draft") =>
    start(async () => {
      try {
        await setVariationStatus(id, status);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });

  // Group by angle: an angle is the idea, the platforms are renderings of it.
  const byAngle = new Map<number, ContentVariation[]>();
  for (const v of variations) {
    const list = byAngle.get(v.angle_index) ?? [];
    list.push(v);
    byAngle.set(v.angle_index, list);
  }
  const angles = [...byAngle.entries()].sort((a, b) => a[0] - b[0]);

  const steps = executableSteps(piece.kind as ContentKind);
  const approved = variations.filter((v) => v.status === "approved").length;

  return (
    <div>
      <PageHeader
        title={piece.topic}
        subtitle={`${brandName} · ${piece.kind} · ${piece.angle_count} angles${
          piece.platforms.length ? ` · ${piece.platforms.map(platformLabel).join(", ")}` : ""
        }`}
        actions={
          <Link href={`/content/${piece.brand_id}?tab=pieces`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
        }
      />

      {piece.status === "running" && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 mb-3 text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Running{piece.current_stage ? ` — ${piece.current_stage.replace(/-/g, " ")}` : ""}. Variations
          appear once the platform adapter runs.
        </div>
      )}
      {piece.status === "failed" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 mb-3 text-xs">
          This run failed. The Activity tab on the brand has the error.
        </div>
      )}

      <div className="ch-tabs mb-4">
        <button onClick={() => setView("variations")} className={`ch-tab ${view === "variations" ? "active" : ""}`}>
          Variations{variations.length ? ` (${variations.length})` : ""}
        </button>
        <button onClick={() => setView("working")} className={`ch-tab ${view === "working" ? "active" : ""}`}>
          Working
        </button>
      </div>

      {view === "variations" &&
        (variations.length === 0 ? (
          <div className="ch-empty">
            <p>No variations yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {piece.status === "running" ? "The agents are still working." : "Nothing was produced for this piece."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              {approved} of {variations.length} approved.
            </p>
            {angles.map(([index, list]) => (
              <div key={index} className="space-y-2">
                <p className="text-sm font-medium">
                  {index + 1}. {list[0].angle}
                </p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((v) => (
                    <VariationCard key={v.id} v={v} onSet={set} busy={pending} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

      {view === "working" && (
        <div className="space-y-2">
          {steps.map((agent) => {
            const artifact = agent.produces
              .map((key) => piece.artifacts?.[key])
              .find(Boolean);
            const expanded = open === agent.id;
            return (
              <div key={agent.id} className="rounded-xl border bg-card overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : agent.id)}
                  disabled={!artifact}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left disabled:opacity-50"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="text-sm font-medium">{agent.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {artifact ? "done" : "not run"}
                  </span>
                </button>
                {expanded && artifact && (
                  <div className="border-t bg-muted/30">
                    <div className="flex justify-end px-4 pt-3">
                      <CopyButton text={artifact.content} />
                    </div>
                    <div className="p-4 pt-2 max-h-[36rem] overflow-y-auto">
                      <ArtifactBody text={artifact.content} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
