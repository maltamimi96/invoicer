import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import { listAgentInstalls } from "@/lib/actions/agents";
import { getEnabledPlugins } from "@/lib/actions/plugins";
import { AgentsStore } from "@/components/agents/agents-store";

export default async function AgentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any)
    .from("businesses")
    .select("user_id, industry_preset")
    .eq("id", businessId)
    .single();

  let userRole: Role = "owner";
  if (biz?.user_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (supabase as any)
      .from("business_members")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    userRole = (member?.role ?? "viewer") as Role;
  }

  if (!canManageSettings(userRole)) redirect("/dashboard");

  const [installs, pluginEnabled] = await Promise.all([
    listAgentInstalls(),
    getEnabledPlugins(),
  ]);

  return (
    <div className="">
      <AgentsStore
        installs={installs}
        pluginEnabled={pluginEnabled}
        activePreset={(biz?.industry_preset as string | null) ?? null}
      />
    </div>
  );
}
