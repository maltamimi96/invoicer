"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { canManageSettings, type Role } from "@/lib/permissions";
import { PLUGINS_BY_ID, resolveEnabledPlugins, dependentsOf } from "@/lib/plugins/registry";
import { PRESETS_BY_ID, presetInstallRows } from "@/lib/plugins/presets";
import { syncPluginSideEffects } from "@/lib/plugins/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Owner or settings-manager check for a SPECIFIC business (not the active
 *  cookie) — the signup wizard applies a preset to the just-created business
 *  before any active-business cookie exists. */
async function assertCanManage(businessId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const { data: biz } = await tbl(supabase, "businesses").select("user_id").eq("id", businessId).single();
  if (!biz) throw new Error("Business not found");
  if (biz.user_id === user.id) return;
  const { data: m } = await tbl(supabase, "business_members")
    .select("role").eq("business_id", businessId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!canManageSettings((m?.role ?? "viewer") as Role)) throw new Error("Only owners and admins can change plugins");
}

/** Current enabled map for the active business (used by the Plugins page). */
export async function getEnabledPlugins(): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const [{ data: rows }, { data: qa }, { data: ob }, { data: fb }] = await Promise.all([
    tbl(supabase, "business_agent_installs").select("agent_id, enabled").eq("business_id", businessId),
    tbl(supabase, "quoting_agent_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
    tbl(supabase, "onboarding_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
    tbl(supabase, "form_builder_settings").select("enabled").eq("business_id", businessId).maybeSingle(),
  ]);
  return resolveEnabledPlugins(rows ?? [], {
    quoting_agent_settings: qa ? !!qa.enabled : null,
    onboarding_settings: ob ? !!ob.enabled : null,
    form_builder_settings: fb ? !!fb.enabled : null,
  });
}

/** Enable/disable one module for the active business. Hides only — never deletes data. */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  await assertCanManage(businessId);

  const plugin = PLUGINS_BY_ID[pluginId];
  if (!plugin) throw new Error(`Unknown plugin "${pluginId}"`);
  if (plugin.core) throw new Error(`${plugin.name} is a core module and can't be disabled`);

  if (!enabled) {
    const current = await getEnabledPlugins();
    const deps = dependentsOf(pluginId, current);
    if (deps.length > 0) {
      throw new Error(`Disable ${deps.map((d) => d.name).join(", ")} first — it depends on ${plugin.name}.`);
    }
  }

  const admin = createAdminClient();
  const { error } = await tbl(admin, "business_agent_installs").upsert(
    { business_id: businessId, agent_id: pluginId, enabled, updated_at: new Date().toISOString() },
    { onConflict: "business_id,agent_id" },
  );
  if (error) throw error;
  await syncPluginSideEffects(admin, businessId, pluginId, enabled);
  revalidatePath("/agents");
  revalidatePath("/", "layout");
}

/** Apply a preset to the ACTIVE business — the Plugins-page entry point (the
 *  core applyIndustryPreset takes an explicit id for the signup path, before an
 *  active-business cookie exists). */
export async function applyPresetToActiveBusiness(presetId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  await applyIndustryPreset(businessId, presetId);
}

/** Apply an industry preset to a business: sets businesses.industry_preset and
 *  writes explicit enable/disable rows for every optional module. Explicit
 *  action only (signup step or Plugins page) — never automatic. */
export async function applyIndustryPreset(businessId: string, presetId: string): Promise<void> {
  const preset = PRESETS_BY_ID[presetId];
  if (!preset) throw new Error(`Unknown preset "${presetId}"`);
  await assertCanManage(businessId);

  const admin = createAdminClient();
  const { error: bizErr } = await tbl(admin, "businesses")
    .update({ industry_preset: preset.id }).eq("id", businessId);
  if (bizErr) throw bizErr;

  const rows = presetInstallRows(businessId, preset);
  const { error } = await tbl(admin, "business_agent_installs")
    .upsert(rows, { onConflict: "business_id,agent_id" });
  if (error) throw error;

  // Keep legacy settings tables in step for the plugins that have them.
  for (const row of rows) {
    if (PLUGINS_BY_ID[row.agent_id]?.settingsTable) {
      await syncPluginSideEffects(admin, businessId, row.agent_id, row.enabled);
    }
  }

  revalidatePath("/agents");
  revalidatePath("/", "layout");
}
