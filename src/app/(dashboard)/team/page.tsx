import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getMemberProfiles } from "@/lib/actions/member-profiles";
import { getMembers } from "@/lib/actions/members";
import { TeamPageClient } from "@/components/team/team-page-client";
import type { Role } from "@/lib/permissions";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();

  let userRole: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: m } = await (supabase as any).from("business_members").select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    userRole = (m?.role ?? "viewer") as Role;
  }

  // Owner email — use the caller's email when they ARE the owner, otherwise
  // fall back to the businesses row (best-effort; the owner row is a header).
  const ownerEmail = biz?.user_id === user.id ? (user.email ?? "") : "";

  const [profiles, members] = await Promise.all([
    getMemberProfiles().catch(() => []),
    getMembers().catch(() => []),
  ]);

  return (
    <TeamPageClient
      profiles={profiles}
      members={members}
      userRole={userRole}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ""}
      ownerEmail={ownerEmail}
    />
  );
}
