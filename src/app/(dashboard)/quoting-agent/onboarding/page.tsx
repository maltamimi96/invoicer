import { redirect } from "next/navigation";
import { getQuotingAgentSettings } from "@/lib/actions/quoting-agent";
import { getBusiness } from "@/lib/actions/business";
import { QuotingAgentOnboardingClient } from "@/components/quoting-agent/onboarding-client";

export default async function QuotingAgentOnboardingPage() {
  const [settings, business] = await Promise.all([
    getQuotingAgentSettings(),
    getBusiness(),
  ]);

  // Already onboarded — bounce to the chat
  if (settings.onboarded_at) redirect("/quoting-agent");

  return (
    <QuotingAgentOnboardingClient
      initialSettings={settings}
      currency={business.currency ?? "AUD"}
    />
  );
}
