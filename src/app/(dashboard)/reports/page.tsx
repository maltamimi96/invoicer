import { getReports } from "@/lib/actions/reports";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const reports = await getReports();
  return <ReportsClient reports={reports} />;
}
