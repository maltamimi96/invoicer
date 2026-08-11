import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/icons";
import { CandidateQueue } from "@/components/prospects/candidate-queue";
import { listCandidates, listHunts } from "@/lib/actions/prospecting";

/** Everything every hunt has verified, in one queue. */
export default async function ReviewPage() {
  const [candidates, hunts] = await Promise.all([
    listCandidates({ status: "verified", limit: 300 }),
    listHunts(),
  ]);
  const nameOf = new Map(hunts.map((h) => [h.id, h.name]));

  return (
    <>
      <PageHeader
        title="Review"
        subtitle="Businesses your hunts found and verified. Add the good ones to your prospect list."
        actions={
          <Button variant="outline" asChild>
            <Link href="/prospects/hunts"><ArrowLeft className="w-4 h-4 mr-1.5" /> Hunts</Link>
          </Button>
        }
      />
      <CandidateQueue
        candidates={candidates}
        emptyMessage="No hunt has anything waiting. Run one to go looking."
        labelFor={(c) => nameOf.get(c.hunt_id) ?? null}
      />
    </>
  );
}
