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
  const [{ data: biz }, { data: member, error: memberError }] = await Promise.all([
    tbl(supabase, "businesses").select("user_id").eq("id", businessId).single(),
    tbl(supabase, "business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (biz?.user_id === user.id) return "owner";

  /**
   * No membership row — or a lookup that failed — means we do not know who this
   * is, and the answer to that must be the LEAST privilege, not a middling one.
   *
   * This used to return "viewer", which is a real role carrying every read
   * scope. Combined with the active_business_id cookie being trusted, that
   * handed a stranger read access to a business they'd merely named. Worker is
   * the hard-isolation role, and it's what mobile already falls back to.
   *
   * A legitimate user is always either the owner (returned above) or holds an
   * active member row, so this branch only fires on the anomaly it guards.
   */
  if (memberError || !member?.role) return "worker";
  return member.role as Role;
});
