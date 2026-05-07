import { notFound } from "next/navigation";
import { getSite, getSiteContactsFull, getSiteJobs } from "@/lib/actions/sites";
import { getCustomer } from "@/lib/actions/customers";
import { getSiteAssets } from "@/lib/actions/site-assets";
import { getBillingProfilesForAccount, getSiteBilling } from "@/lib/actions/billing-profiles";
import { SiteDetailClient } from "@/components/sites/site-detail-client";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();

  // Each child fetch is best-effort. If any single one throws (eg. customer
  // was archived, contacts table empty, etc) we still want the page to
  // render — show what we have, don't 500 on the user.
  const [account, siteContacts, assets, jobs, billingProfiles, siteBilling] = await Promise.all([
    getCustomer(site.account_id).catch(() => null),
    getSiteContactsFull(id).catch(() => []),
    getSiteAssets(id).catch(() => []),
    getSiteJobs(id).catch(() => []),
    getBillingProfilesForAccount(site.account_id).catch(() => []),
    getSiteBilling(id).catch(() => null),
  ]);

  // Without the parent customer the page loses its breadcrumb context.
  // Cleaner to 404 than crash mid-render.
  if (!account) notFound();

  return (
    <SiteDetailClient
      site={site}
      account={account}
      siteContacts={siteContacts}
      assets={assets}
      jobs={jobs}
      billingProfiles={billingProfiles}
      currentBillingProfileId={siteBilling?.billing_profile_id ?? null}
    />
  );
}
