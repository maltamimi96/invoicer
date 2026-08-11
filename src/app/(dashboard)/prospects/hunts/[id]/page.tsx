import { notFound } from "next/navigation";
import { getHunt, listHuntRuns, listCandidates } from "@/lib/actions/prospecting";
import { HuntDetail } from "@/components/prospects/hunt-detail";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const hunt = await getHunt(id);
  if (!hunt) notFound();

  const [runs, candidates] = await Promise.all([
    listHuntRuns(id),
    listCandidates({ hunt_id: id, status: "verified" }),
  ]);

  return <HuntDetail hunt={hunt} runs={runs} candidates={candidates} />;
}
