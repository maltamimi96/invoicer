import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserOrNull } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { isWorker, isPathAllowedForWorker, type Role } from "@/lib/permissions";
import { resolveEnabledPlugins, ROUTE_GATES } from "@/lib/plugins/registry";
import type { Business } from "@/types/database";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getUserOrNull();

  if (!user) redirect("/auth/login");

  // Fetch owned businesses and memberships in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: ownedRaw }, { data: membershipsRaw }] = await Promise.all([
    sb.from("businesses").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
    sb.from("business_members").select("business_id, role, businesses(*)").eq("user_id", user.id).eq("status", "active"),
  ]);

  const ownedBusinesses = (ownedRaw ?? []) as Business[];
  const memberships = (membershipsRaw ?? []) as { business_id: string; role: string; businesses: Business }[];

  // Combine, keeping owned first, deduplicating
  const allBusinesses: Business[] = [...ownedBusinesses];
  for (const m of memberships) {
    if (m.businesses && !allBusinesses.find((b) => b.id === m.business_id)) {
      allBusinesses.push(m.businesses);
    }
  }

  if (allBusinesses.length === 0) redirect("/onboarding");

  // Pick active business from cookie, fallback to first
  const cookieStore = await cookies();
  const activeBizId = cookieStore.get("active_business_id")?.value;
  const business = (activeBizId ? allBusinesses.find((b) => b.id === activeBizId) : undefined) ?? allBusinesses[0];

  // Determine role
  const isOwnerOfBiz = ownedBusinesses.some((b) => b.id === business.id);
  let userRole: Role = "owner";
  if (!isOwnerOfBiz) {
    const membership = memberships.find((m) => m.business_id === business.id);
    userRole = (membership?.role ?? "viewer") as Role;
  }

  // Idempotent profile link — fire-and-forget so it doesn't block render.
  // The function is SECURITY DEFINER and a no-op if nothing matches, so
  // we don't care about its completion timing.
  void sb.rpc("link_my_member_profile").then(() => undefined, () => undefined);

  // Redirect workers away from pages they shouldn't see
  if (isWorker(userRole)) {
    const h = await headers();
    const path = h.get("x-pathname") ?? h.get("x-invoke-path") ?? "/dashboard";
    if (!isPathAllowedForWorker(path)) {
      redirect("/work-orders");
    }
  }

  // Plugin system (docs/SEO_AGENCY_PLAN.md P0) — resolve which modules this
  // business has enabled. No install row = the plugin's default (legacy
  // modules default ON), so existing businesses see zero change until they
  // explicitly toggle something. Legacy settings tables stay authoritative
  // for the three original feature-flagged verticals.
  const [{ data: installRows }, { data: quotingSettings }, { data: onboardingSettings }, { data: formBuilderSettings }] = await Promise.all([
    sb.from("business_agent_installs").select("agent_id, enabled").eq("business_id", business.id),
    sb.from("quoting_agent_settings").select("enabled").eq("business_id", business.id).maybeSingle(),
    sb.from("onboarding_settings").select("enabled").eq("business_id", business.id).maybeSingle(),
    sb.from("form_builder_settings").select("enabled").eq("business_id", business.id).maybeSingle(),
  ]);
  const plugins = resolveEnabledPlugins(installRows ?? [], {
    quoting_agent_settings: quotingSettings ? !!quotingSettings.enabled : null,
    onboarding_settings: onboardingSettings ? !!onboardingSettings.enabled : null,
    form_builder_settings: formBuilderSettings ? !!formBuilderSettings.enabled : null,
  });

  // Route-level gating: visiting a disabled plugin's URL redirects home
  // (hiding nav alone would leave features reachable by direct link).
  {
    const h = await headers();
    const path = h.get("x-pathname") ?? "";
    const gate = ROUTE_GATES.find((g) => path === g.prefix || path.startsWith(g.prefix + "/"));
    if (gate && !plugins[gate.pluginId]) redirect("/dashboard");
  }

  return (
    <DashboardShell business={business} businesses={allBusinesses} user={user} userRole={userRole} features={plugins}>
      {children}
    </DashboardShell>
  );
}
