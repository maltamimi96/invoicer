import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getClientFieldConfig } from "@/lib/actions/client-fields";
import { ClientFieldsSettings } from "@/components/settings/client-fields-settings";

export default async function ClientFieldsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const config = await getClientFieldConfig();
  return <ClientFieldsSettings config={config} />;
}
