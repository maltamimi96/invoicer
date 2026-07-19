/**
 * Cross-request cached reads for the (dashboard) layout — the queries that run
 * on EVERY dashboard navigation (business list + plugin feature flags).
 *
 * Before this, each navigation re-ran 6 queries (2 business + 4 flag tables)
 * even though the data changes rarely. Each getter mirrors the established
 * `getCustomers` unstable_cache pattern: keyed per user/business, tagged so
 * mutations invalidate precisely, short TTL as the staleness backstop for any
 * write path that forgets to invalidate (e.g. admin-client writes).
 *
 * Plain module (no "use server") — a "use server" file may only export plain
 * async functions, and we also export tag-name helpers (strings).
 */
import { unstable_cache } from "next/cache";
import { unwrap, unwrapRows } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/types/database";

/** Tag: a user's business list (owned + memberships). Invalidate on
 *  create-business, invite activation, and business renames. */
export const bizListTag = (userId: string) => `biz-list-${userId}`;

/** Tag: a business's plugin/feature flags (installs + legacy settings
 *  tables). Invalidate from syncPluginSideEffects + the legacy toggles. */
export const pluginFlagsTag = (businessId: string) => `plugin-flags-${businessId}`;

/** Tag: a single business row (getBusiness). Invalidate on business updates. */
export const businessTag = (businessId: string) => `business-${businessId}`;

export interface LayoutBusinesses {
  owned: Business[];
  memberships: { business_id: string; role: string; businesses: Business }[];
}

/** Uncached fetch — used by the cache MISS path and as a direct re-check when
 *  the cached list comes back empty (a brand-new user who just created their
 *  first business must not be bounced back to /onboarding by a stale cache). */
export async function fetchLayoutBusinessesDirect(userId: string): Promise<LayoutBusinesses> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    sb.from("businesses").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    sb.from("business_members").select("business_id, role, businesses(*)").eq("user_id", userId).eq("status", "active"),
  ]);
  return {
    owned: (owned ?? []) as Business[],
    memberships: (memberships ?? []) as LayoutBusinesses["memberships"],
  };
}

/** The user's businesses (owned + member-of), cached 60s / tag-invalidated. */
export async function getLayoutBusinesses(userId: string): Promise<LayoutBusinesses> {
  return unstable_cache(
    () => fetchLayoutBusinessesDirect(userId),
    [`layout-businesses-${userId}`],
    { tags: [bizListTag(userId)], revalidate: 60 }
  )();
}

export interface PluginFlagRows {
  installRows: { agent_id: string; enabled: boolean }[];
  quoting: boolean | null;
  onboarding: boolean | null;
  formBuilder: boolean | null;
}

/** The business's plugin flags (installs + 3 legacy settings tables), cached
 *  5 min / tag-invalidated from every toggle path (store, legacy actions,
 *  MCP set_plugin_enabled, industry presets — all via syncPluginSideEffects). */
export async function getPluginFlags(businessId: string): Promise<PluginFlagRows> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  return unstable_cache(
    async () => {
      const [installRes, quotingRes, onboardingRes, formBuilderRes] = await Promise.all([
        sb.from("business_agent_installs").select("agent_id, enabled").eq("business_id", businessId),
        sb.from("quoting_agent_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
        sb.from("onboarding_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
        sb.from("form_builder_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
      ]);

      // Throw rather than fall through to `?? []`. On a failed query the old
      // code resolved to "no install rows, no settings", the resolver fell back
      // to registry defaults, and the business's enabled plugins silently
      // vanished from the nav — then unstable_cache stored that wrong answer for
      // five minutes, so a one-off blip persisted long after it cleared.
      //
      // Throwing widens the blast radius (this backs every dashboard page), but
      // a 500 is recoverable by refresh and now reaches Sentry, whereas
      // half the product quietly disappearing is neither. A missing settings
      // row is NOT an error — maybeSingle gives data:null, error:null.
      const installRows = unwrapRows(installRes, "plugin installs") as PluginFlagRows["installRows"];
      const quoting = unwrap(quotingRes, "quoting agent settings") as { enabled: boolean } | null;
      const onboarding = unwrap(onboardingRes, "onboarding settings") as { enabled: boolean } | null;
      const formBuilder = unwrap(formBuilderRes, "form builder settings") as { enabled: boolean } | null;

      return {
        installRows,
        quoting: quoting ? !!quoting.enabled : null,
        onboarding: onboarding ? !!onboarding.enabled : null,
        formBuilder: formBuilder ? !!formBuilder.enabled : null,
      };
    },
    [`plugin-flags-${businessId}`],
    { tags: [pluginFlagsTag(businessId)], revalidate: 300 }
  )();
}
