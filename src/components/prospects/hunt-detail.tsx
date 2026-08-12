"use client";

/**
 * One hunt: run it, watch it, read what the auditor made of it, work the queue.
 *
 * The audit panel is the part that earns its place. A run that returns 3 when
 * you asked for 40 used to be a number and a shrug; now the run says which
 * stage lost them and what to change. That is the difference between tuning a
 * hunt and abandoning it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@/components/layout/use-mutation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Play, MapPin, Trash2, Edit, Target, AlertTriangle, CheckCircle,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { CandidateQueue } from "@/components/prospects/candidate-queue";
import { HuntProgress, startHunt } from "@/components/prospects/hunt-progress";
import { HuntBuilder, draftFrom, validateDraft, type HuntDraft } from "@/components/prospects/hunt-builder";
import { deleteHunt, updateHunt } from "@/lib/actions/prospecting";
import type {
  ProspectHunt, ProspectHuntRun, ProspectCandidate, ProspectAudit,
} from "@/types/database";

interface Props {
  hunt: ProspectHunt;
  runs: ProspectHuntRun[];
  candidates: ProspectCandidate[];
  /** A run already in flight when the page loaded, so reopening rejoins it. */
  activeRunId: string | null;
}

const SEVERITY: Record<string, string> = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20",
  low: "border-border bg-muted/30",
};

function AuditPanel({ audit, shortfall }: { audit: ProspectAudit; shortfall: boolean }) {
  if (!audit.summary && !audit.problems?.length) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 font-medium">
        {shortfall
          ? <AlertTriangle className="w-4 h-4 text-amber-500" />
          : <CheckCircle className="w-4 h-4 text-emerald-500" />}
        What the auditor made of this run
      </p>

      {audit.summary && (
        <p className="mt-2 text-sm text-muted-foreground break-words">{audit.summary}</p>
      )}

      {audit.problems?.length > 0 && (
        <div className="mt-3 space-y-2">
          {audit.problems.map((p, i) => (
            <div key={i} className={cn("rounded-lg border p-3", SEVERITY[p.severity] ?? SEVERITY.low)}>
              <p className="text-sm font-medium break-words">{p.title}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words">{p.detail}</p>
              <p className="mt-1.5 text-sm break-words">
                <span className="font-medium">Fix: </span>{p.fix}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HuntDetail({ hunt, runs, candidates, activeRunId }: Props) {
  const router = useRouter();
  const { run: mutate, pending } = useMutation();
  const [runId, setRunId] = useState<string | null>(activeRunId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HuntDraft>(() => draftFrom(hunt));

  const last = runs[0];
  const audit = (last?.audit ?? null) as ProspectAudit | null;
  const shortfall = Boolean(last && last.verified < (hunt.target_count ?? 20));

  async function handleRun() {
    const id = await startHunt(hunt.id);
    if (id) setRunId(id);
  }

  function handleSave() {
    const problem = validateDraft(draft);
    if (problem) { toast.error(problem); return; }
    void mutate(async () => {
      await updateHunt(hunt.id, {
        name: draft.name,
        queries: draft.queries,
        criteria: draft.criteria,
        target_count: draft.target_count,
        area_mode: draft.area_mode,
        area: draft.area,
        radius_km: draft.radius_km,
        suburb_labels: draft.suburb_labels,
        custom_params: draft.custom_params,
        filters: draft.filters,
      });
      setEditing(false);
    }, { busy: "Saving hunt…", success: "Hunt updated", error: "Couldn't save" });
  }

  function handleDelete() {
    if (!confirm(`Delete "${hunt.name}" and everything it found?`)) return;
    void mutate(() => deleteHunt(hunt.id), {
      busy: "Deleting…", success: "Hunt deleted", error: "Couldn't delete", refresh: false,
    }).then(() => router.push("/prospects/hunts"));
  }

  const areaText = hunt.area_mode === "suburbs"
    ? (hunt.suburbs ?? []).map((s) => s.label).join(" · ") || "No suburbs set"
    : `${hunt.centre_label ?? "No area set"} · ${Math.round(hunt.radius_m / 1000)}km`;

  return (
    <>
      <PageHeader
        title={hunt.name}
        subtitle={hunt.criteria}
        trail={[
          { label: "Prospects", href: "/prospects" },
          { label: "Prospecting", href: "/prospects/hunts" },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => { setDraft(draftFrom(hunt)); setEditing(true); }}>
              <Edit className="w-4 h-4 mr-1.5" /> Edit
            </Button>
            <Button variant="outline" onClick={handleDelete} disabled={pending} aria-label="Delete hunt">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRun} disabled={pending}>
              <Play className="w-4 h-4 mr-1.5" /> Run hunt
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Target className="w-4 h-4" /> Wants {hunt.target_count ?? 20}</span>
        <span className="flex items-center gap-1.5 break-words"><MapPin className="w-4 h-4" /> {areaText}</span>
        <span className="break-words">Searching: {hunt.queries.join(" · ")}</span>
        {hunt.custom_params?.length > 0 && (
          <span>{hunt.custom_params.length} named {hunt.custom_params.length === 1 ? "requirement" : "requirements"}</span>
        )}
      </div>

      {runId && (
        <HuntProgress
          runId={runId}
          onFinished={(finishedRun) => {
            toast[finishedRun.status === "done" ? "success" : "error"](
              finishedRun.status === "done"
                ? `${finishedRun.verified} to review`
                : finishedRun.error ?? "The hunt stopped",
            );
            router.refresh();
          }}
        />
      )}

      {!runId && audit && <AuditPanel audit={audit} shortfall={shortfall} />}

      {!runId && last?.error && !audit?.problems?.length && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {last.error}
        </p>
      )}

      <h2 className="mb-3 text-lg font-semibold">
        Review queue{" "}
        {candidates.length > 0 && <span className="text-muted-foreground">({candidates.length})</span>}
      </h2>

      <CandidateQueue
        candidates={candidates}
        emptyMessage={runs.length === 0
          ? "Run the hunt to find businesses in your area."
          : "Everything from the last run has been dealt with. Run it again to look for new listings."}
      />

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Edit hunt</DialogTitle></DialogHeader>
          <HuntBuilder draft={draft} onChange={setDraft} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
            <Button onClick={handleSave} disabled={pending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
