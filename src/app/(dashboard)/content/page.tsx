import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { listContentBrands } from "@/lib/actions/content";
import { ContentBrandsView } from "@/components/content/content-brands-view";

/**
 * Content Studio home — the brand list.
 *
 * Route-gated by the plugin resolver in (dashboard)/layout.tsx: hiding the nav
 * item alone would leave /content reachable by direct link.
 */
export default async function ContentPage() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const [brands, { data: customers }] = await Promise.all([
    listContentBrands(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("customers")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("name")
      .limit(500),
  ]);

  return (
    <ContentBrandsView
      brands={brands}
      customers={(customers ?? []) as { id: string; name: string }[]}
    />
  );
}
