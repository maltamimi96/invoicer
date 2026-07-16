import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSeoSite } from "@/lib/actions/seo";
import { listContentPieces, getSeoBudget, listOpportunities } from "@/lib/actions/seo-pipeline";
import { listConnections } from "@/lib/actions/seo-connections";
import { listSeoReports } from "@/lib/actions/seo-reports";
import { githubAppConfigured } from "@/lib/seo/github-app";
import { SeoSiteHub } from "@/components/seo/seo-site-hub";

// The Opportunity Scout (opus + web search) runs as a server action from this
// route — give it room so it isn't cut off mid-scan.
export const maxDuration = 300;

type Search = { tab?: string; github?: string; gh?: string };

export default async function SeoSiteHubPage(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> },
) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const site = await getSeoSite(id);
  if (!site) notFound();

  const [pieces, budget, connections, opportunities, reports] = await Promise.all([
    listContentPieces(id),
    getSeoBudget(),
    listConnections(id),
    listOpportunities(id),
    listSeoReports(id),
  ]);

  return (
    <SeoSiteHub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      site={site as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pieces={pieces as any}
      connections={connections}
      opportunities={opportunities}
      reports={reports}
      budget={budget}
      // The GitHub callback lands here with ?tab=connections&github=… — resolve
      // it server-side so the right tab opens with its outcome.
      initialTab={sp.tab === "connections" ? "connections" : undefined}
      githubAppReady={githubAppConfigured()}
      githubStatus={sp.github ?? null}
      ghToken={sp.gh ?? null}
    />
  );
}
