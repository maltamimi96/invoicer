import { getRecurringJobs } from "@/lib/actions/recurring-jobs";
import { getCustomers } from "@/lib/actions/customers";
import { getMemberProfiles } from "@/lib/actions/member-profiles";
import { getProducts } from "@/lib/actions/products";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { RecurringJobsClient } from "@/components/recurring/recurring-jobs-client";

export default async function RecurringPage() {
  const [schedules, customers, profiles, products] = await Promise.all([
    getRecurringJobs(),
    getCustomers(),
    getMemberProfiles(),
    getProducts(),
  ]);

  // Business currency for the line-items editor.
  let currency = "GBP";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const businessId = await getActiveBizId(supabase as any, user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: biz } = await (supabase as any).from("businesses").select("currency").eq("id", businessId).single();
      currency = biz?.currency ?? "GBP";
    }
  } catch { /* default currency */ }

  return (
    <RecurringJobsClient
      initialSchedules={schedules}
      customers={customers}
      profiles={profiles}
      products={products}
      currency={currency}
    />
  );
}
