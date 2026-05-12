import { getQuotingAgentSettings, listKnowledge } from "@/lib/actions/quoting-agent";
import { getBusiness } from "@/lib/actions/business";
import { QuotingAgentSettingsClient } from "@/components/quoting-agent/settings-client";

export default async function QuotingAgentSettingsPage() {
  const [settings, knowledge, business] = await Promise.all([
    getQuotingAgentSettings(),
    listKnowledge(),
    getBusiness(),
  ]);

  return (
    <QuotingAgentSettingsClient
      settings={settings}
      knowledge={knowledge}
      currency={business.currency ?? "AUD"}
    />
  );
}
