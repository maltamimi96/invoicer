import { notFound } from "next/navigation";
import { getHunt, listHuntRuns, listCandidates, listCampaignsForHunts } from "@/lib/actions/prospecting";
import { HuntDetail } from "@/components/prospects/hunt-detail";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const hunt = await getHunt(id);
  if (!hunt) notFound();

  const [runs, candidates, campaigns] = await Promise.all([
    listHuntRuns(id),
    listCandidates({ hunt_id: id, status: "verified" }),
    listCampaignsForHunts(),
  ]);

  // A run started in another tab (or before a reload) is rejoined rather than
  // orphaned — the work continues server-side either way, so the page should
  // pick the progress back up instead of pretending nothing is happening.
  const active = runs.find((r) => r.status === "running") ?? null;

  return (
    <HuntDetail
      hunt={hunt}
      runs={runs}
      candidates={candidates}
      activeRunId={active?.id ?? null}
      campaigns={campaigns}
    />
  );
}
