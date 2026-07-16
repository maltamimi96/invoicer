import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listProspects } from "@/lib/actions/prospects";
import { ProspectsView } from "@/components/prospects/prospects-view";

export default async function ProspectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const prospects = await listProspects();
  return <ProspectsView prospects={prospects} />;
}
