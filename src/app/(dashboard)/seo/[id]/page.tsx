import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSeoSite } from "@/lib/actions/seo";
import { listContentPieces, getSeoBudget, listOpportunities } from "@/lib/actions/seo-pipeline";
import { listConnections } from "@/lib/actions/seo-connections";
import { SeoSiteHub } from "@/components/seo/seo-site-hub";

export const dynamic = "force-dynamic";
// The Opportunity Scout (opus + web search) runs as a server action from this
// route — give it room so it isn't cut off mid-scan.
export const maxDuration = 300;

export default async function SeoSiteHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const site = await getSeoSite(id);
  if (!site) notFound();

  const [pieces, budget, connections, opportunities] = await Promise.all([
    listContentPieces(id),
    getSeoBudget(),
    listConnections(id),
    listOpportunities(id),
  ]);

  return (
    <SeoSiteHub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      site={site as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pieces={pieces as any}
      connections={connections}
      opportunities={opportunities}
      budget={budget}
    />
  );
}
