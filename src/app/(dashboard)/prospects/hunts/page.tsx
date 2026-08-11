import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { listHunts } from "@/lib/actions/prospecting";
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

  const [hunts, review, settings] = await Promise.all([
    listHunts(),
    supabase.from("prospect_candidates")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "verified"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("outreach_settings")
      .select("places_api_key_enc").eq("business_id", businessId).maybeSingle(),
  ]);

  return (
    <HuntsView
      hunts={hunts}
      pendingReview={review.count ?? 0}
      hasPlacesKey={Boolean(settings.data?.places_api_key_enc)}
    />
  );
}
