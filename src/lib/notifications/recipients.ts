import type { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

type Sb = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolve email recipients for a business based on role.
 * 'owner' returns the business owner's email; member roles look up active business_members.
 * Returns deduped, non-empty emails.
 */
export async function getRecipientsForRoles(
  supabase: Sb,
  businessId: string,
  roles: Array<'owner' | MemberRole>,
): Promise<string[]> {
  const out = new Set<string>();

  if (roles.includes('owner')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("businesses").select("email").eq("id", businessId).single();
    if (data?.email) out.add(data.email);
  }

  const memberRoles = roles.filter((r): r is MemberRole => r !== 'owner');
  if (memberRoles.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("business_members")
      .select("email")
      .eq("business_id", businessId)
      .eq("status", "active")
      .in("role", memberRoles);
    for (const row of data ?? []) {
      if (row?.email) out.add(row.email);
    }
  }

  return [...out];
}
