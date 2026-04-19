import { getRecurringJobs } from "@/lib/actions/recurring-jobs";
import { getCustomers } from "@/lib/actions/customers";
import { getMemberProfiles } from "@/lib/actions/member-profiles";
import { RecurringJobsClient } from "@/components/recurring/recurring-jobs-client";

export default async function RecurringPage() {
  const [schedules, customers, profiles] = await Promise.all([
    getRecurringJobs(),
    getCustomers(),
    getMemberProfiles(),
  ]);
  return <RecurringJobsClient initialSchedules={schedules} customers={customers} profiles={profiles} />;
}
