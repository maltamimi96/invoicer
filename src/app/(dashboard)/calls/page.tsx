import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import { getTelephonySettings, getWebhookUrl, listCalls, getCallStats } from "@/lib/actions/telephony";
import { CallsClient } from "@/components/telephony/calls-client";

export default async function CallsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const settings = await getTelephonySettings();
  const [calls, stats, webhookUrl] = await Promise.all([
    listCalls({ limit: 200 }),
    getCallStats(),
    getWebhookUrl(),
  ]);

  return <CallsClient settings={settings} calls={calls} stats={stats} webhookUrl={webhookUrl} />;
}
