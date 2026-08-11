"use client";

/**
 * One hunt: run it, see where the funnel lost people, work its review queue.
 *
 * The funnel numbers are shown because "found 60, 4 to review" is the honest
 * story of a hunt — hiding the filtering makes a thin result look like a
 * broken search rather than a narrow criteria string.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useMutation } from "@/components/layout/use-mutation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Play, MapPin, ArrowLeft, Trash2 } from "@/components/ui/icons";
import { CandidateQueue } from "@/components/prospects/candidate-queue";
import { runHuntNow, deleteHunt } from "@/lib/actions/prospecting";
import type { ProspectHunt, ProspectHuntRun, ProspectCandidate } from "@/types/database";

interface Props {
  hunt: ProspectHunt;
  runs: ProspectHuntRun[];
  candidates: ProspectCandidate[];
}

export function HuntDetail({ hunt, runs, candidates }: Props) {
  const { run, pending } = useMutation();
  const [hunting, setHunting] = useState(false);
  const last = runs[0];

  function handleRun() {
    setHunting(true);
    void run(async () => {
      const result = await runHuntNow(hunt.id);
      if (result.error) throw new Error(result.error);
      toast.success(
        result.verified > 0
          ? `${result.verified} to review — ${result.found} found, ${result.screened_out + result.rejected} filtered out`
          : `Nothing matched — ${result.found} found, all filtered out`,
      );
    }, {
      busy: "Hunting… searching, screening, then judging each one",
      error: "The hunt failed",
    }).finally(() => setHunting(false));
  }

  function handleDelete() {
    if (!confirm(`Delete "${hunt.name}" and everything it found?`)) return;
    void run(() => deleteHunt(hunt.id), {
      busy: "Deleting…", success: "Hunt deleted", error: "Couldn't delete", refresh: false,
    }).then(() => { window.location.href = "/prospects/hunts"; });
  }

  return (
    <>
      <PageHeader
        title={hunt.name}
        subtitle={hunt.criteria}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/prospects/hunts"><ArrowLeft className="w-4 h-4 mr-1.5" /> All hunts</Link>
            </Button>
            <Button variant="outline" onClick={handleDelete} disabled={pending} aria-label="Delete hunt">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button onClick={handleRun} disabled={pending || hunting}>
              {hunting ? <Spinner size="sm" className="mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
              {hunting ? "Hunting…" : "Run hunt"}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4" />
          {hunt.centre_label ?? "No area set"} · {Math.round(hunt.radius_m / 1000)}km
        </span>
        <span className="break-words">Searching: {hunt.queries.join(" · ")}</span>
      </div>

      {last && (
        <div className="ch-stat-grid mb-6">
          <div className="ch-stat"><span>Found</span><strong>{last.found}</strong></div>
          <div className="ch-stat"><span>Filtered out</span><strong>{last.screened_out}</strong></div>
          <div className="ch-stat"><span>Not a fit</span><strong>{last.rejected}</strong></div>
          <div className="ch-stat"><span>To review</span><strong>{last.verified}</strong></div>
        </div>
      )}

      {last?.error && (
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
    </>
  );
}
