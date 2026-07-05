import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getOnboardingForm, getSecureFieldsAvailable } from "@/lib/actions/onboarding";
import { FormBuilderClient } from "@/components/onboarding/form-builder-client";

export const dynamic = "force-dynamic";

export default async function OnboardingFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  let form;
  try { form = await getOnboardingForm(id); } catch { notFound(); }
  if (!form) notFound();

  const secureAvailable = await getSecureFieldsAvailable();
  return <FormBuilderClient form={form} secureAvailable={secureAvailable} />;
}
