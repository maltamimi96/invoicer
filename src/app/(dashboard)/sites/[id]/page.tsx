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

  const [account, siteContacts, assets, jobs, billingProfiles, siteBilling] = await Promise.all([
    getCustomer(site.account_id),
    getSiteContactsFull(id),
    getSiteAssets(id),
    getSiteJobs(id),
    getBillingProfilesForAccount(site.account_id),
    getSiteBilling(id),
  ]);

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
