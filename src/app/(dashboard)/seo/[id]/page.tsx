import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSeoSite } from "@/lib/actions/seo";
import { listContentPieces, getSeoBudget } from "@/lib/actions/seo-pipeline";
import { SeoSiteHub } from "@/components/seo/seo-site-hub";

export const dynamic = "force-dynamic";

export default async function SeoSiteHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const site = await getSeoSite(id);
  if (!site) notFound();

  const [pieces, budget, connectionsRes, jobsRes] = await Promise.all([
    listContentPieces(id),
    getSeoBudget(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("seo_connections").select("provider, status, account_ref, connected_at").eq("business_id", businessId).eq("site_id", id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("seo_jobs").select("id, type, status, step, cost_cents, error, created_at, updated_at").eq("business_id", businessId).eq("site_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <SeoSiteHub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      site={site as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pieces={pieces as any}
      connections={(connectionsRes.data ?? []) as { provider: string; status: string; account_ref: string | null; connected_at: string | null }[]}
      jobs={(jobsRes.data ?? []) as { id: string; type: string; status: string; step: number; cost_cents: number; error: string | null; created_at: string }[]}
      budget={budget}
    />
  );
}
