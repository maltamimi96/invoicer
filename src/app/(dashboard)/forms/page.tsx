import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { getFormBuilderSettings, getPublicForms, listAllFormSubmissions } from "@/lib/actions/forms";
import { appUrl } from "@/lib/app-url";
import { FormsListClient } from "@/components/forms/forms-list-client";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; form?: string }>;
}) {
  const supabase = await createClient();
  try {
    const user = await getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getActiveBizId(supabase as any, user.id);
  } catch {
    redirect("/auth/login");
  }

  const settings = await getFormBuilderSettings();
  if (!settings.enabled) {
    return <FormsListClient enabled={false} forms={[]} baseUrl={appUrl()} />;
  }

  const { tab, form } = await searchParams;
  const onSubmissions = tab === "submissions";

  // Only pay for submissions when that tab is actually open — the forms list
  // already carries the counts the tab label needs.
  const [forms, submissions] = await Promise.all([
    getPublicForms(),
    onSubmissions ? listAllFormSubmissions(form) : Promise.resolve([]),
  ]);

  return (
    <FormsListClient
      enabled
      forms={forms}
      baseUrl={appUrl()}
      submissions={submissions}
      tab={onSubmissions ? "submissions" : "forms"}
      activeFormId={form}
    />
  );
}
