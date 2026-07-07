import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listSeoSites } from "@/lib/actions/seo";
import { listContentPieces, getSeoBudget } from "@/lib/actions/seo-pipeline";
import { SeoContentList } from "@/components/seo/seo-content-list";

export const dynamic = "force-dynamic";

export default async function SeoContentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const [pieces, sites, budget] = await Promise.all([listContentPieces(), listSeoSites(), getSeoBudget()]);
  return (
    <SeoContentList
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pieces={pieces as any}
      sites={sites.map((s) => ({ id: s.id, domain: s.domain }))}
      budget={budget}
    />
  );
}
