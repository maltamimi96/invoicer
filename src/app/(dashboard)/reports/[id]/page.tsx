import { notFound } from "next/navigation";
import { getReport } from "@/lib/actions/reports";
import { getBusiness } from "@/lib/actions/business";
import { ReportDetailClient } from "@/components/reports/report-detail-client";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [report, business] = await Promise.all([getReport(id), getBusiness()]);
    return <ReportDetailClient report={report} business={business} />;
  } catch {
    notFound();
  }
}
