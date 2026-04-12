import { getConversations, startConversation } from "@/lib/actions/sms";
import { getCustomers } from "@/lib/actions/customers";
import { MessagesClient } from "@/components/messages/messages-client";

interface Props {
  searchParams: Promise<{ phone?: string; name?: string; customer?: string }>;
}

export default async function MessagesPage({ searchParams }: Props) {
  const { phone, name, customer } = await searchParams;

  const [conversations, customers] = await Promise.all([
    getConversations().catch(() => []),
    getCustomers().catch(() => []),
  ]);

  // If linked from a customer page, ensure the conversation exists
  let autoConvId: string | null = null;
  if (phone) {
    try {
      const e164 = formatE164(phone);
      autoConvId = await startConversation({
        customerPhone: e164,
        customerName: name ?? phone,
        customerId: customer ?? null,
      });
    } catch { /* best-effort */ }
  }

  return (
    <MessagesClient
      conversations={conversations}
      customers={customers}
      autoOpenConvId={autoConvId}
    />
  );
}

function formatE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("61")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}
