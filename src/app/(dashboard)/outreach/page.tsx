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
  const businessId = await getActiveBizId(supabase as any, user.id);

  const settings = await getOutreachSettings();
  const [stats, campaigns, sequences, messages, business] = await Promise.all([
    getOutreachStats(),
    listCampaigns(),
    listSequences(),
    listOutreachMessages({ limit: 100 }),
    // The design preview renders with the real business identity, so it shows
    // the actual email rather than an approximation of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("businesses").select("name, logo_url").eq("id", businessId).maybeSingle()
      .then((r: { data: { name: string; logo_url: string | null } | null }) => r.data),
  ]);

  return (
    <OutreachClient
      settings={settings}
      stats={stats}
      campaigns={campaigns}
      sequences={sequences}
      messages={messages}
      businessName={business?.name ?? "Your business"}
      businessLogoUrl={business?.logo_url ?? null}
    />
  );
}
