import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getAuditLink, listAudits } from "@/lib/actions/seo-audits";
import { SeoAuditsView } from "@/components/seo/seo-audits-view";

export const dynamic = "force-dynamic";

export default async function SeoAuditsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const [{ url }, audits] = await Promise.all([getAuditLink(), listAudits()]);
  return <SeoAuditsView link={url} audits={audits} />;
}
