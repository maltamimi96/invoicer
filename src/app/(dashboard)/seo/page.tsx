import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listSeoSites } from "@/lib/actions/seo";
import { getSeoBudget } from "@/lib/actions/seo-pipeline";
import { SeoSitesView } from "@/components/seo/seo-sites-view";

export default async function SeoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const [sites, { data: customers }, budget] = await Promise.all([
    listSeoSites(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("customers")
      .select("id, name")
      .eq("business_id", businessId)
      .order("name")
      .limit(500),
    getSeoBudget(),
  ]);

  return (
    <SeoSitesView
      sites={sites}
      customers={(customers ?? []) as { id: string; name: string }[]}
      budget={budget}
    />
  );
}
