import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { listHunts, getProspectingBudget } from "@/lib/actions/prospecting";
import { resolvePlacesKey } from "@/lib/prospecting/run";
import { HuntsView } from "@/components/prospects/hunts-view";

export default async function HuntsPage() {
  const supabase = await createClient();
  let businessId: string;
  try {
    const user = await getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    businessId = await getActiveBizId(supabase as any, user.id);
  } catch {
    redirect("/auth/login");
  }

  const [hunts, review, budget, places] = await Promise.all([
    listHunts(),
    supabase.from("prospect_candidates")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "verified"),
    getProspectingBudget(),
    resolvePlacesKey(supabase, businessId),
  ]);

  return (
    <HuntsView
      hunts={hunts}
      pendingReview={review.count ?? 0}
      budget={budget}
      // Only whether a key exists crosses to the client — never the key.
      canHunt={Boolean(places.key)}
    />
  );
}
