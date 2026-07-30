import { notFound } from "next/navigation";
import { getPayRun } from "@/lib/actions/payroll";
import { PayRunDetailClient } from "@/components/payroll/pay-run-detail-client";

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { run, lines } = await getPayRun(id);
    return <PayRunDetailClient run={run} lines={lines} />;
  } catch {
    notFound();
  }
}
