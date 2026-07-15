import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserOrNull } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { isWorker, isPathAllowedForWorker, type Role } from "@/lib/permissions";
import { resolveEnabledPlugins, ROUTE_GATES } from "@/lib/plugins/registry";
import { PRESETS_BY_ID } from "@/lib/plugins/presets";
import { getLayoutBusinesses, fetchLayoutBusinessesDirect, getPluginFlags } from "@/lib/layout-data";
import type { Business } from "@/types/database";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getUserOrNull();

  if (!user) redirect("/auth/login");

  // Owned businesses + memberships — cached cross-request (60s / tag) since
  // they change rarely but were re-fetched on every navigation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  let { owned: ownedBusinesses, memberships } = await getLayoutBusinesses(user.id);

  // Empty-list safety: a brand-new user who just created their first business
  // must not be bounced to /onboarding by a stale cached empty list — re-check
  // directly (rare path: only users with zero cached businesses hit this).
  if (ownedBusinesses.length === 0 && memberships.length === 0) {
    ({ owned: ownedBusinesses, memberships } = await fetchLayoutBusinessesDirect(user.id));
  }

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
  const flags = await getPluginFlags(business.id);
  const plugins = resolveEnabledPlugins(flags.installRows, {
    quoting_agent_settings: flags.quoting,
    onboarding_settings: flags.onboarding,
    form_builder_settings: flags.formBuilder,
  });

  // Route-level gating: visiting a disabled plugin's URL redirects home
  // (hiding nav alone would leave features reachable by direct link).
  {
    const h = await headers();
    const path = h.get("x-pathname") ?? "";
    const gate = ROUTE_GATES.find((g) => path === g.prefix || path.startsWith(g.prefix + "/"));
    if (gate && !plugins[gate.pluginId]) redirect("/dashboard");
  }

  // Vocabulary v1 — sidebar label overrides from the business's industry preset.
  const vocab = business.industry_preset ? PRESETS_BY_ID[business.industry_preset]?.vocab ?? null : null;

  return (
    <DashboardShell business={business} businesses={allBusinesses} user={user} userRole={userRole} features={plugins} vocab={vocab}>
      {children}
    </DashboardShell>
  );
}
