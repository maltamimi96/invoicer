"use server";

/**
 * Automations CRUD + the plugin flag.
 *
 * Expected failures are RETURNED, not thrown — Next masks thrown server-action
 * messages in production, and "why won't my automation save" is exactly the
 * question that needs a real answer.
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { pluginFlagsTag } from "@/lib/layout-data";
import {
  validateAutomation, type AutomationCondition, type AutomationAction,
} from "@/lib/automations/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export interface AutomationRow {
  id: string;
  business_id: string;
  name: string;
  enabled: boolean;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  trigger_event: string;
  entity_type: string;
  entity_id: string;
  status: string;
  attempt_count: number;
  finished_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any[];
  error: string | null;
  created_at: string;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function getAutomationsEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data } = await tbl(supabase, "automations_settings")
    .select("enabled").eq("business_id", businessId).maybeSingle();
  return Boolean(data?.enabled);
}

export async function setAutomationsEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "automations_settings")
    .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  if (error) throw error;

  // Mirror into the Plugins store so the card reflects state whichever side
  // was toggled — the same pattern the other plugins use.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createAdminClient() as any).from("business_agent_installs").upsert(
      { business_id: businessId, agent_id: "automations", enabled, updated_at: new Date().toISOString() },
      { onConflict: "business_id,agent_id" },
    );
  } catch { /* non-fatal */ }

  revalidateTag(pluginFlagsTag(businessId), "max");
  revalidatePath("/automations");
  revalidatePath("/agents");
  revalidatePath("/", "layout");
}

export async function getAutomations(): Promise<AutomationRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "automations")
    .select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your automations: ${error.message}`);
  return (data ?? []) as AutomationRow[];
}

/** Recent runs, newest first — the answer to "did it actually fire?". */
export async function getAutomationRuns(automationId?: string): Promise<AutomationRunRow[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  let q = tbl(supabase, "automation_runs")
    .select("id, automation_id, trigger_event, entity_type, entity_id, status, attempt_count, finished_at, result, error, created_at")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(50);
  if (automationId) q = q.eq("automation_id", automationId);
  const { data } = await q;
  return (data ?? []) as AutomationRunRow[];
}

export async function saveAutomation(input: {
  id?: string;
  name: string;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled?: boolean;
}): Promise<SaveResult> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // The same check the browser ran. A check only the client performs isn't one.
  const problem = validateAutomation(input);
  if (problem) return { ok: false, error: problem };

  const row = {
    business_id: businessId,
    name: input.name.trim(),
    trigger_event: input.trigger_event,
    conditions: input.conditions ?? [],
    actions: input.actions ?? [],
    enabled: input.enabled ?? true,
  };

  if (input.id) {
    const { error } = await tbl(supabase, "automations")
      .update(row).eq("id", input.id).eq("business_id", businessId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/automations");
    return { ok: true, id: input.id };
  }

  const { data, error } = await tbl(supabase, "automations").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  return { ok: true, id: data.id };
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "automations")
    .update({ enabled }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/automations");
}

export async function deleteAutomation(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  // Runs cascade with the rule; the history goes with the thing it describes.
  const { error } = await tbl(supabase, "automations")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/automations");
}
