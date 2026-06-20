import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusiness } from "@/lib/actions/business";
import { listApiKeys } from "@/lib/actions/api-keys";
import { getEmailConfig } from "@/lib/actions/email-config";
import { listWebhooks } from "@/lib/actions/webhooks";
import { getStripeAccountStatus } from "@/lib/actions/stripe";
import { getActiveBizId } from "@/lib/active-business";
import { canManageSettings, type Role } from "@/lib/permissions";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Determine the caller's role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const businessId = await getActiveBizId(supabase as any, user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: biz } = await (supabase as any).from("businesses").select("user_id").eq("id", businessId).single();
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

  const [business, apiKeys, emailConfig, webhooks, stripeStatus] = await Promise.all([
    getBusiness(),
    listApiKeys(),
    getEmailConfig(),
    listWebhooks(),
    getStripeAccountStatus(),
  ]);

  return (
    <SettingsClient
      business={business}
      apiKeys={apiKeys}
      emailConfig={emailConfig}
      webhooks={webhooks}
      stripeStatus={stripeStatus}
      userRole={userRole}
    />
  );
}
