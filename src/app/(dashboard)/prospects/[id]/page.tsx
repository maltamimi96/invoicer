import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getProspect, listProspectActivities } from "@/lib/actions/prospects";
import { ProspectDetail } from "@/components/prospects/prospect-detail";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const prospect = await getProspect(id);
  if (!prospect) notFound();
  const activities = await listProspectActivities(id);
  return <ProspectDetail prospect={prospect} activities={activities} />;
}
