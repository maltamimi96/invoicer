import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getOnboardingSettings, getOnboardingForms, getOnboardingRequests } from "@/lib/actions/onboarding";
import { getCustomers } from "@/lib/actions/customers";
import { OnboardingFormsClient } from "@/components/onboarding/onboarding-forms-client";

export const dynamic = "force-dynamic";

export default async function OnboardingFormsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const settings = await getOnboardingSettings();
  if (!settings.enabled) {
    return <OnboardingFormsClient enabled={false} forms={[]} requests={[]} customers={[]} />;
  }

  const [forms, requests, customers] = await Promise.all([
    getOnboardingForms(),
    getOnboardingRequests(),
    getCustomers(),
  ]);

  return <OnboardingFormsClient enabled forms={forms} requests={requests} customers={customers} />;
}
