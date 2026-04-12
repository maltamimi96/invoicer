import { getLeads } from "@/lib/actions/leads";
import { LeadsClient } from "@/components/leads/leads-client";

export default async function LeadsPage() {
  const leads = await getLeads();
  return <LeadsClient leads={leads} />;
}
