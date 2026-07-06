import { redirect } from "next/navigation";
import Link from "next/link";
import { getQuotingAgentSettings } from "@/lib/actions/quoting-agent";
import { QuotingAgentChatClient } from "@/components/quoting-agent/chat-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "@/components/ui/icons";

export default async function QuotingAgentPage() {
  const settings = await getQuotingAgentSettings();

  // Disabled — show an enable card
  if (!settings.enabled) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500 flex items-center justify-center text-white mx-auto">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Quoting Agent</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Turn natural-language briefs into accurate quotes. The agent learns your pricing, applies your margins, and writes the line items for you.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/quoting-agent/onboarding">Get started</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Enabled but never onboarded — push them through onboarding
  if (!settings.onboarded_at) redirect("/quoting-agent/onboarding");

  return <QuotingAgentChatClient />;
}
