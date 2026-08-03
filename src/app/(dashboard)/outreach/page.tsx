import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import {
  getOutreachSettings, getOutreachStats, listCampaigns, listSequences, listOutreachMessages,
} from "@/lib/actions/outreach";
import { OutreachClient } from "@/components/outreach/outreach-client";

export default async function OutreachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await getActiveBizId(supabase as any, user.id);

  const settings = await getOutreachSettings();
  const [stats, campaigns, sequences, messages] = await Promise.all([
    getOutreachStats(),
    listCampaigns(),
    listSequences(),
    listOutreachMessages({ limit: 100 }),
  ]);

  return (
    <OutreachClient
      settings={settings}
      stats={stats}
      campaigns={campaigns}
      sequences={sequences}
      messages={messages}
    />
  );
}
