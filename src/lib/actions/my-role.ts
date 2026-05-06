"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Resolve the caller's role in the active business. Owner is derived from
 *  businesses.user_id; other roles come from business_members. Cached at the
 *  request level via getActiveBizId. */
export async function getMyRole(): Promise<Role> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (biz?.user_id === user.id) return "owner";

  const { data: member } = await tbl(supabase, "business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return (member?.role ?? "viewer") as Role;
}
