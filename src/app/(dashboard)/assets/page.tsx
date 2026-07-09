import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { listAssets } from "@/lib/actions/assets";
import { AssetsView } from "@/components/assets/assets-view";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);

  const [assets, membersRes] = await Promise.all([
    listAssets(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("member_profiles").select("id, name").eq("business_id", businessId).eq("is_active", true).order("name"),
  ]);

  return <AssetsView assets={assets} members={(membersRes.data ?? []) as { id: string; name: string }[]} />;
}
