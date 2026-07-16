import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getPublicForm, getFormSubmissions } from "@/lib/actions/forms";
import { appUrl } from "@/lib/app-url";
import { FormsBuilderClient } from "@/components/forms/forms-builder-client";

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  let form;
  try { form = await getPublicForm(id); } catch { notFound(); }
  if (!form) notFound();
  const submissions = await getFormSubmissions(id).catch(() => []);

  return <FormsBuilderClient form={form} submissions={submissions} baseUrl={appUrl()} />;
}
