import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { SeoPipelineView } from "@/components/seo/seo-pipeline-view";

export default async function SeoPipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  return <SeoPipelineView />;
}
