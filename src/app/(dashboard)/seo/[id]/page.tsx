import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getSeoSite } from "@/lib/actions/seo";
import { listContentPieces, getSeoBudget, listOpportunities } from "@/lib/actions/seo-pipeline";
import { listConnections, getSearchPerformance } from "@/lib/actions/seo-connections";
import { listSeoReports } from "@/lib/actions/seo-reports";
import { githubAppConfigured } from "@/lib/seo/github-app";
import { gscConfigured } from "@/lib/seo/gsc";
import { encryptionAvailable } from "@/lib/crypto";
import { SeoSiteHub } from "@/components/seo/seo-site-hub";

// The Opportunity Scout (opus + web search) runs as a server action from this
// route — give it room so it isn't cut off mid-scan.
export const maxDuration = 300;

type Search = { tab?: string; github?: string; gh?: string; gsc?: string; g?: string; guess?: string };
const TABS = ["overview", "content", "performance", "opportunities", "connections", "reports", "activity"] as const;
type TabId = (typeof TABS)[number];

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

  const [pieces, budget, connections, opportunities, reports, performance] = await Promise.all([
    listContentPieces(id),
    getSeoBudget(),
    listConnections(id),
    listOpportunities(id),
    listSeoReports(id),
    getSearchPerformance(id).catch(() => ({ rows: [], totals: { clicks: 0, impressions: 0, keywords: 0 }, lastSynced: null })),
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
      initialTab={TABS.includes(sp.tab as TabId) ? (sp.tab as TabId) : undefined}
      githubAppReady={githubAppConfigured()}
      githubStatus={sp.github ?? null}
      ghToken={sp.gh ?? null}
      // GSC needs BOTH a Google client and the encryption key (it persists a
      // refresh token) — gate on both so the button can't fail after consent.
      gscReady={gscConfigured() && encryptionAvailable()}
      gscStatus={sp.gsc ?? null}
      gscToken={sp.g ?? null}
      gscGuess={sp.guess ?? null}
      performance={performance}
    />
  );
}
