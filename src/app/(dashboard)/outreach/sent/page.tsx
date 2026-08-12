import { PageHeader } from "@/components/layout/page-header";
import { listSentMessages } from "@/lib/actions/outreach";
import { SentView } from "@/components/outreach/sent-view";

/** Everything the outreach agent has sent, and what came of it. */
export default async function SentPage() {
  const messages = await listSentMessages();
  return (
    <>
      <PageHeader
        title="Sent"
        subtitle="Every email the outreach agent has sent, and whether it landed"
        trail={[{ label: "Outreach", href: "/outreach" }]}
      />
      <SentView messages={messages} />
    </>
  );
}
