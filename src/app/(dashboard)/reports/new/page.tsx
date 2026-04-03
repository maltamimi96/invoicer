import { getCustomers } from "@/lib/actions/customers";
import { getBusiness } from "@/lib/actions/business";
import { ReportGenerator } from "@/components/reports/report-generator";

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: defaultCustomerId } = await searchParams;
  const [customers, business] = await Promise.all([getCustomers(), getBusiness()]);
  return <ReportGenerator customers={customers} business={business} defaultCustomerId={defaultCustomerId} />;
}
