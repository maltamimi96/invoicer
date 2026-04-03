/**
 * Shared utility — NOT a server action file.
 * Can be imported from server components, server actions, and route handlers.
 */
import { cookies } from "next/headers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActiveBizId(supabase: any, userId: string): Promise<string> {
  const cookieStore = await cookies();
  const stored = cookieStore.get("active_business_id")?.value;

  if (stored) {
    // Check if user owns this business
    const { data: owned } = await supabase
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .eq("id", stored)
      .maybeSingle();
    if (owned) return owned.id as string;

    // Check if user is an active member of this business
    const { data: membership } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", userId)
      .eq("business_id", stored)
      .eq("status", "active")
      .maybeSingle();
    if (membership) return membership.business_id as string;
  }

  // Fallback: first owned business
  const { data: firstOwned } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstOwned) return firstOwned.id as string;

  // Fallback: first business where user is an active member
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
}
