import { getLeads, listLeadTagPresets } from "@/lib/actions/leads";
import { LeadsClient } from "@/components/leads/leads-client";

export default async function LeadsPage() {
  const [leads, tagPresets] = await Promise.all([
    getLeads(),
    listLeadTagPresets().catch(() => []),
  ]);
  return <LeadsClient leads={leads} tagPresets={tagPresets} />;
}
