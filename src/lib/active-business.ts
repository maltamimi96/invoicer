/**
 * Shared utility — NOT a server action file.
 * Can be imported from server components, server actions, and route handlers.
 */
import { cache } from "react";
import { cookies } from "next/headers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Returns the active business ID for the current user.
 *
 * Fast path: if the active_business_id cookie is set, return it immediately.
 * Supabase RLS is the real security gate — every query already scopes to the
 * user's session, so a tampered cookie cannot leak another user's data.
 *
 * Wrapped in React `cache()` so repeated calls within the same server render
 * only run once (deduplicates across parallel server component fetches).
 */
export const getActiveBizId = cache(async (supabase: AnySupabase, userId: string): Promise<string> => {
  const cookieStore = await cookies();
  const stored = cookieStore.get("active_business_id")?.value;

  // Trust the cookie — RLS enforces actual access at the query level
  if (stored) return stored;

  // First-ever login: no cookie set yet, query the DB once
  const { data: firstOwned } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstOwned) return firstOwned.id as string;

  const { data: firstMember } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstMember) return firstMember.business_id as string;

  throw new Error("No business found. Please complete onboarding.");
});

/**
 * Does this user actually belong to this business?
 *
 * getActiveBizId trusts the cookie, and everywhere it's used that is fine —
 * RLS re-checks access on every query, so a tampered cookie just yields empty
 * results. The exception is any path that goes on to use the SERVICE-ROLE
 * client, which bypasses RLS entirely: there the cookie is the only thing
 * naming the tenant, and trusting it is a cross-tenant read.
 *
 * Call this before handing a cookie-derived business id to an admin client.
 *
 * The lookups run on the caller's own RLS-scoped client, so a business the user
 * has no claim to simply returns no row — the check can't be talked out of it
 * by a forged id. Errors fail closed.
 */
export async function userBelongsToBusiness(
  supabase: AnySupabase,
  userId: string,
  businessId: string,
): Promise<boolean> {
  const [owned, member] = await Promise.all([
    supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", userId).maybeSingle(),
    supabase.from("business_members").select("business_id")
      .eq("business_id", businessId).eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  if (owned.error || member.error) return false;
  return Boolean(owned.data) || Boolean(member.data);
}
