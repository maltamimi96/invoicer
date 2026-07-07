/**
 * Plugin/agent side-effect sync — keeps downstream settings tables in step
 * with business_agent_installs toggles. Plain module (no "use server") shared
 * by the agents-store actions and the MCP set_plugin_enabled tool.
 *
 *   email-lead-scanner ↔ business_email_config.enabled
 *   client-onboarding  ↔ onboarding_settings.enabled
 *   form-builder       ↔ form_builder_settings.enabled
 *   quoting-agent      ↔ quoting_agent_settings.enabled
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPluginSideEffects(sb: any, businessId: string, pluginId: string, enabled: boolean): Promise<void> {
  if (pluginId === "email-lead-scanner") {
    await tbl(sb, "business_email_config").update({ enabled }).eq("business_id", businessId);
  }
  if (pluginId === "client-onboarding") {
    await tbl(sb, "onboarding_settings")
      .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  }
  if (pluginId === "form-builder") {
    await tbl(sb, "form_builder_settings")
      .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  }
  if (pluginId === "quoting-agent") {
    await tbl(sb, "quoting_agent_settings")
      .upsert({ business_id: businessId, enabled }, { onConflict: "business_id" });
  }
}
