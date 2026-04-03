import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { Role } from "@/lib/permissions";
import type { Business } from "@/types/database";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Activate any pending memberships for this user's email (no-op if none)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc("activate_pending_memberships");

  // Businesses the user owns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ownedRaw } = await (supabase as any)
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const ownedBusinesses = (ownedRaw ?? []) as Business[];

  // Businesses the user is an active member of (not owner)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membershipsRaw } = await (supabase as any)
    .from("business_members")
    .select("business_id, role, businesses(*)")
    .eq("user_id", user.id)
    .eq("status", "active");
  const memberships = (membershipsRaw ?? []) as { business_id: string; role: string; businesses: Business }[];

  // Combine, keeping owned first, deduplicating
  const allBusinesses: Business[] = [...ownedBusinesses];
  for (const m of memberships) {
    if (m.businesses && !allBusinesses.find((b) => b.id === m.business_id)) {
      allBusinesses.push(m.businesses);
    }
  }

  // Workers with no owned business and no memberships yet → onboarding
  if (allBusinesses.length === 0) redirect("/onboarding");

  // Pick active business from cookie, fallback to first
  const cookieStore = await cookies();
  const activeBizId = cookieStore.get("active_business_id")?.value;
  const business = (activeBizId ? allBusinesses.find((b) => b.id === activeBizId) : undefined) ?? allBusinesses[0];

  // Determine caller's role for the active business
  const isOwnerOfBiz = ownedBusinesses.some((b) => b.id === business.id);
  let userRole: Role = "owner";
  if (!isOwnerOfBiz) {
    const membership = memberships.find((m) => m.business_id === business.id);
    userRole = (membership?.role ?? "viewer") as Role;
  }

  return (
    <DashboardShell business={business} businesses={allBusinesses} user={user} userRole={userRole}>
      {children}
    </DashboardShell>
  );
}
