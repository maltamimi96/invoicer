import { Sparkles } from "@/components/ui/icons";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { listAssistantConversations } from "@/lib/actions/assistant";
import type { AssistantConversation } from "@/types/database";

/**
 * The assistant's home. This page used to render a briefing widget and nothing
 * else — the only actual chat was a 400px floating panel. The briefing moved to
 * the dashboard's own widgets; this is now a real chat surface.
 */
export default async function AssistantPage() {
  let conversations: AssistantConversation[] = [];
  let denied = false;

  try {
    conversations = await listAssistantConversations();
  } catch {
    // Workers are denied the assistant outright (see lib/assistant/scopes) —
    // their tools bypass RLS, which is the layer that isolates them. Anything
    // else that throws here is treated the same way: no chat rather than a
    // broken one.
    denied = true;
  }

  return (
    <div>
      <div className="ch-page-header">
        <div>
          <h1 className="ch-page-title flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Your AI assistant
          </h1>
          <p className="ch-page-subtitle">
            Ask anything about your business, or tell me what to do — I can run quotes, invoices,
            jobs, customers and more.
          </p>
        </div>
      </div>

      {denied ? (
        <div className="ch-empty">
          <p>The assistant isn&apos;t available for your access level.</p>
        </div>
      ) : (
        <AssistantChat initialConversations={conversations} />
      )}
    </div>
  );
}
