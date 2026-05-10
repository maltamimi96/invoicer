import { notFound } from "next/navigation";
import { getLead } from "@/lib/actions/leads";
import { LeadDetailClient } from "@/components/leads/lead-detail-client";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const lead = await getLead(id);
    return <LeadDetailClient lead={lead} />;
  } catch {
    notFound();
  }
}
