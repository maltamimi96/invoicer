"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function getCallerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any)
    .from("businesses")
    .select("user_id")
    .eq("id", businessId)
    .single();

  let role: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (supabase as any)
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    role = (member?.role ?? "viewer") as Role;
  }

  if (!canManageSettings(role)) throw new Error("Forbidden");
  return { user, businessId };
}

export interface AgentInstall {
  id: string;
  business_id: string;
  agent_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installed_at: string;
  updated_at: string;
}

/** Return all agent installs for the active business. */
export async function listAgentInstalls(): Promise<AgentInstall[]> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();
  const { data, error } = await tbl(sb, "business_agent_installs")
    .select("*")
    .eq("business_id", businessId);
  if (error) throw new Error("Failed to load agent installs");
  return data ?? [];
}

/** Install (or re-enable) an agent for the active business. */
export async function installAgent(agentId: string): Promise<void> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();

  const { error } = await tbl(sb, "business_agent_installs").upsert(
    {
      business_id: businessId,
      agent_id: agentId,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,agent_id" }
  );
  if (error) throw new Error("Failed to install agent");

  await syncSideEffects(sb, businessId, agentId, true);
  revalidatePath("/agents");
}

/** Remove an agent from the business entirely. */
export async function uninstallAgent(agentId: string): Promise<void> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();

  const { error } = await tbl(sb, "business_agent_installs")
    .delete()
    .eq("business_id", businessId)
    .eq("agent_id", agentId);
  if (error) throw new Error("Failed to uninstall agent");

  await syncSideEffects(sb, businessId, agentId, false);
  revalidatePath("/agents");
}

/** Enable or disable an installed agent. */
export async function toggleAgent(agentId: string, enabled: boolean): Promise<void> {
  const { businessId } = await getCallerContext();
  const sb = createAdminClient();

  const { error } = await tbl(sb, "business_agent_installs")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("agent_id", agentId);
  if (error) throw new Error("Failed to update agent");

  await syncSideEffects(sb, businessId, agentId, enabled);
  revalidatePath("/agents");
}

/**
 * Keep downstream tables in sync when agent state changes.
 * email-lead-scanner ↔ business_email_config.enabled
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncSideEffects(sb: any, businessId: string, agentId: string, enabled: boolean) {
  if (agentId === "email-lead-scanner") {
    await tbl(sb, "business_email_config")
      .update({ enabled })
      .eq("business_id", businessId);
  }
}
