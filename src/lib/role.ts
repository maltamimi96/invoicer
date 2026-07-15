import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/**
 * Request-scoped cached role resolution for the active business.
 *
 * Owner is derived from businesses.user_id; other roles come from
 * business_members. Wrapped in React cache() so the layout and the page tree
 * share one resolution per request instead of each re-querying — this lives
 * in a plain module because a "use server" file may only export plain async
 * functions (a cache()-wrapped export breaks the build).
 */
export const getMyRoleCached = cache(async (): Promise<Role> => {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // Owner check and member lookup are independent — run them in parallel.
  const [{ data: biz }, { data: member }] = await Promise.all([
    tbl(supabase, "businesses").select("user_id").eq("id", businessId).single(),
    tbl(supabase, "business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (biz?.user_id === user.id) return "owner";
  return (member?.role ?? "viewer") as Role;
});
