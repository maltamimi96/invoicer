"use client";

import { useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Play, Trash2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ArtifactBody, CopyButton } from "@/components/ui/artifact-body";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  advanceContentPipeline, approveContentPiece, publishContentPiece,
  deleteContentPiece, getUnpublishSupport,
} from "@/lib/actions/seo-pipeline";
import { executableSteps, SEO_AGENTS_BY_ID, SEO_ARTIFACTS } from "@/lib/seo/pipeline";
import type { ConnectionView } from "@/lib/seo/connectors";
import type { SeoContentPiece, SeoContentType } from "@/types/database";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  piece: SeoContentPiece & { seo_sites?: { domain: string } | null };
  connections: ConnectionView[];
}

const STATUS_TONE: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  idle: "bg-muted text-muted-foreground",
};

export function SeoContentDetail({ piece, connections }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const publishable = connections.filter((c) => c.provider !== "gsc");
  const [connId, setConnId] = useState(publishable[0]?.id ?? "");

  // Delete. Two distinct outcomes, so the dialog asks rather than assuming:
  // leave the live article alone, or take it down too.
  const [delOpen, setDelOpen] = useState(false);
  const [unpub, setUnpub] = useState<{ ok: boolean; reason?: string; provider?: string } | null>(null);
  const isPublished = piece.status === "published";

  function openDelete() {
    setDelOpen(true);
    setUnpub(null);
    if (isPublished) {
      getUnpublishSupport(piece.id)
        .then(setUnpub)
        .catch(() => setUnpub({ ok: false, reason: "Couldn't check the connection." }));
    }
  }

  function handleDelete(alsoUnpublish: boolean) {
    startTransition(async () => {
      try {
        await deleteContentPiece(piece.id, { unpublish: alsoUnpublish });
        toast.success(alsoUnpublish ? "Deleted and removed from the site" : "Deleted from Kirei");
        setDelOpen(false);
        router.push(`/seo/${piece.site_id}?tab=content`);
      } catch (e) {
        // An unpublish failure means nothing was deleted — say so.
        toast.error(e instanceof Error ? e.message : "Couldn't delete");
      }
    });
  }

  function handlePublish() {
    if (!connId) { toast.error("Connect a gateway first"); return; }
    startTransition(async () => {
      try {
        const res = await publishContentPiece(piece.id, connId);
        toast.success(res.url ? "Published" : "Published (no public URL returned)");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Publish failed");
      }
    });
  }

  const steps = executableSteps((piece.content_type ?? "blog") as SeoContentType);
  const artifacts = piece.artifacts ?? {};
  const stepDone = (agentId: string) =>
    (SEO_AGENTS_BY_ID[agentId]?.produces ?? []).every((k) => !!artifacts[k]?.content);
  const currentIdx = steps.findIndex((s) => !stepDone(s));
  const status = piece.pipeline_status ?? "idle";

  async function runOne() {
    return advanceContentPipeline(piece.id);
  }

  function handleNext() {
    startTransition(async () => {
      try {
        const r = await runOne();
        toast.success(r.status === "awaiting_approval" ? "Draft complete — ready for review" : "Step complete");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Step failed");
      }
    });
  }

  async function handleRunToFinish() {
    setRunning(true);
    try {
      for (let i = 0; i < steps.length + 1; i++) {
        const r = await runOne();
        refresh();
        if (r.status === "awaiting_approval") { toast.success("Draft complete — ready for review"); break; }
        if (r.status === "failed") { toast.error("A step failed — see the stage below"); break; }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveContentPiece(piece.id);
        toast.success("Approved");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't approve");
      }
    });
  }

  const busy = isPending || running;

  return (
    <>
      <PageHeader
        title={piece.title || piece.topic || "Content piece"}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="capitalize">{piece.content_type}</span>
            {piece.seo_sites?.domain && <span>· {piece.seo_sites.domain}</span>}
            <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5", STATUS_TONE[status])}>{status.replace("_", " ")}</span>
          </span>
        }
        actions={
          <>
            <button onClick={openDelete} disabled={isPending} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive rounded-md border border-border px-3 py-1.5">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            {/* Back to the piece's OWN site hub — content lives per-site now. */}
            <Link href={`/seo/${piece.site_id}?tab=content`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border px-3 py-1.5">
              <ArrowLeft className="w-4 h-4" /> {piece.seo_sites?.domain ?? "Back to site"}
            </Link>
          </>
        }
      />

      {/* Controls */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {status !== "awaiting_approval" && status !== "done" && (
          <>
            <Button onClick={handleRunToFinish} disabled={busy}>
              <Play className="w-4 h-4 mr-1.5" /> {running ? "Running…" : "Run to draft"}
            </Button>
            <Button variant="outline" onClick={handleNext} disabled={busy}>Run next step</Button>
          </>
        )}
        {status === "awaiting_approval" && (
          <Button onClick={handleApprove} disabled={busy}>
            <Check className="w-4 h-4 mr-1.5" /> Approve
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {currentIdx === -1 ? "All stages complete" : `Stage ${currentIdx + 1} of ${steps.length}`}
          {busy && " · working…"}
        </span>
      </div>

      {/* Publish */}
      {stepDone("content-editor-fact-checker") && (
        <div className="rounded-xl border border-border bg-card p-4 mb-6 flex items-center gap-3 flex-wrap">
          {piece.published_url ? (
            <div className="flex-1 min-w-0 text-sm">
              <span className="text-emerald-700 font-medium">Published</span>
              <span className="text-muted-foreground"> → </span>
              <a href={piece.published_url} target="_blank" rel="noreferrer" className="underline break-all">{piece.published_url}</a>
            </div>
          ) : publishable.length === 0 ? (
            <p className="flex-1 min-w-0 text-sm text-muted-foreground">
              Connect a publishing gateway on the{" "}
              <Link href={`/seo/${piece.site_id}`} className="underline">site&apos;s Connections tab</Link>{" "}to publish this.
            </p>
          ) : (
            <>
              <span className="text-sm font-medium">Publish to</span>
              <select value={connId} onChange={(e) => setConnId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                {publishable.map((c) => <option key={c.id} value={c.id}>{c.label || c.provider}{c.account_ref ? ` · ${c.account_ref}` : ""}</option>)}
              </select>
              <Button onClick={handlePublish} disabled={busy}>Publish</Button>
            </>
          )}
        </div>
      )}

      {/* Stage list — each agent + its product */}
      <div className="flex flex-col gap-2">
        {steps.map((agentId, i) => {
          const agent = SEO_AGENTS_BY_ID[agentId];
          const done = stepDone(agentId);
          const isCurrent = i === currentIdx && (status === "running" || status === "idle");
          const producedKey = agent?.produces?.[0];
          const artifact = producedKey ? artifacts[producedKey]?.content : undefined;
          const expanded = open === agentId;
          return (
            <div key={agentId} className={cn("rounded-xl border bg-card", isCurrent ? "border-emerald-500" : "border-border")}>
              <button
                onClick={() => artifact && setOpen(expanded ? null : agentId)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                  done ? "bg-emerald-600 text-white" : isCurrent ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500" : "bg-muted text-muted-foreground"
                )}>
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{agent?.name}</p>
                  <p className="text-[11px] text-muted-foreground">{agent?.role}</p>
                </div>
                {agent?.produces?.map((k) => (
                  <span key={k} className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0", done ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                    {SEO_ARTIFACTS[k].label}
                  </span>
                ))}
                {artifact && (expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
              </button>
              {expanded && artifact && (
                <div className="border-t border-border bg-muted/30">
                  <div className="flex items-center justify-end gap-1.5 px-4 pt-3">
                    <CopyButton text={artifact} />
                  </div>
                  {/* The agents write markdown — this used to be a <pre> in
                      mono, so a finished article read as a wall of raw text
                      with literal ** and #. */}
                  <div className="p-4 pt-2 max-h-[36rem] overflow-y-auto">
                    <ArtifactBody text={artifact} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete. Two outcomes, so we ask rather than pick for you. */}
      <Dialog open={delOpen} onOpenChange={(o) => !o && setDelOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete &ldquo;{piece.title}&rdquo;?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {isPublished ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This piece is <span className="font-medium text-foreground">published</span>. Choose what happens to the live article.
                </p>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-sm font-semibold">Remove from Kirei only</p>
                  <p className="text-xs text-muted-foreground">The article stays live on the client&apos;s site. You&apos;d take it down there yourself.</p>
                </div>
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-sm font-semibold text-destructive">Remove from Kirei and unpublish</p>
                  <p className="text-xs text-muted-foreground">
                    {unpub === null
                      ? "Checking whether the live article can be removed…"
                      : unpub.ok
                        ? `Deletes the live article from ${unpub.provider === "git-github" ? "the repo (a commit removing the file)" : unpub.provider}. This affects the client's real site.`
                        : unpub.reason}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This piece was never published, so nothing is live. It&apos;ll be removed from the pipeline.
              </p>
            )}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setDelOpen(false)} disabled={isPending}>Cancel</Button>
            <Button variant="outline" onClick={() => handleDelete(false)} disabled={isPending}>
              {isPublished ? "Remove from Kirei only" : "Delete"}
            </Button>
            {isPublished && (
              <Button
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={() => handleDelete(true)}
                disabled={isPending || !unpub?.ok}
                title={unpub?.ok ? undefined : unpub?.reason}
              >
                Delete and unpublish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
