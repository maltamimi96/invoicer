import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { getNavConfig } from "@/lib/actions/navigation";
import { resolveEnabledPlugins } from "@/lib/plugins/registry";
import { getPluginFlags } from "@/lib/layout-data";
import { PRESETS_BY_ID } from "@/lib/plugins/presets";
import { navSections, filterNav } from "@/components/layout/nav-config";
import { NavigationSettings, type NavRow } from "@/components/settings/navigation-settings";

export default async function NavigationSettingsPage() {
  const supabase = await createClient();
  const user = await getUser().catch(() => null);
  if (!user) redirect("/auth/login");
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any)
    .from("businesses").select("industry_preset").eq("id", businessId).maybeSingle();

  const flags = await getPluginFlags(businessId);
  const plugins = resolveEnabledPlugins(flags.installRows, {
    quoting_agent_settings: flags.quoting,
    onboarding_settings: flags.onboarding,
    form_builder_settings: flags.formBuilder,
  });

  // Only offer what this business actually has: listing a disabled plugin's
  // page here would invite renaming something that isn't in their sidebar.
  // `nav` is omitted on purpose so hidden items still appear — otherwise
  // hiding one would remove the only control that could bring it back.
  const rows: NavRow[] = filterNav(navSections, { workerView: false, features: plugins })
    .flatMap((s) => s.items.map((i) => ({ href: i.href, fallback: i.label, section: s.section })));

  const preset = biz?.industry_preset ? PRESETS_BY_ID[biz.industry_preset] : null;

  return (
    <NavigationSettings
      rows={rows}
      config={await getNavConfig()}
      presetVocab={preset?.vocab ?? null}
      presetName={preset?.label ?? null}
    />
  );
}
