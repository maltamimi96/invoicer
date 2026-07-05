import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getFormBuilderSettings, getPublicForms } from "@/lib/actions/forms";
import { appUrl } from "@/lib/app-url";
import { FormsListClient } from "@/components/forms/forms-list-client";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const settings = await getFormBuilderSettings();
  if (!settings.enabled) {
    return <FormsListClient enabled={false} forms={[]} baseUrl={appUrl()} />;
  }
  const forms = await getPublicForms();
  return <FormsListClient enabled forms={forms} baseUrl={appUrl()} />;
}
