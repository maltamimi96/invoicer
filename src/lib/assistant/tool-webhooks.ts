/**
 * Fire business webhooks for assistant-initiated mutations.
 *
 * The MCP tool registry is a parallel implementation against raw Supabase and
 * does **not** call dispatchWebhook — only the server actions in lib/actions do.
 * So routing the assistant through the shared registry would silently stop a
 * customer's webhooks firing for anything the assistant did. This bridges that
 * gap in one place rather than touching ~200 tools.
 *
 * Deliberately conservative: only events that already exist in the
 * WebhookEvent union and only tools whose meaning is unambiguous. Events that
 * are subscribable but never fired anywhere (invoice.overdue, quote.rejected,
 * booking.confirmed, booking.no_show) are left alone — wiring them up here
 * would make the assistant the only source of an event the rest of the app
 * never emits, which is worse than the current honest gap.
 */

import { dispatchWebhook } from "@/lib/webhooks";
import type { WebhookEvent } from "@/types/database";

/** tool name -> event it means. */
const TOOL_EVENTS: Record<string, WebhookEvent> = {
  create_customer: "customer.created",
  update_customer: "customer.updated",
  create_lead: "lead.created",
  update_lead: "lead.updated",
  set_lead_status: "lead.updated",
  create_invoice: "invoice.created",
  send_invoice_email: "invoice.sent",
  mark_invoice_paid: "invoice.paid",
  add_invoice_payment: "payment.received",
  create_quote: "quote.created",
  send_quote_email: "quote.sent",
  create_work_order: "work_order.created",
};

/**
 * Pull an id out of a tool's result text.
 *
 * Tools return `text(row)` / `text({id, ...})`, so the JSON usually carries the
 * id — but the shape isn't guaranteed across ~200 hand-written tools. Returning
 * null (and sending the args instead) is fine: webhook payloads are already
 * inconsistent across the existing 21 dispatch sites, so consumers cannot rely
 * on a fixed shape anyway.
 */
function idFromResult(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && "id" in parsed) {
      const id = (parsed as { id: unknown }).id;
      return typeof id === "string" ? id : null;
    }
  } catch {
    // Not JSON — plenty of tools return prose. Nothing to extract.
  }
  return null;
}

/**
 * Best-effort dispatch after a successful tool call.
 *
 * dispatchWebhook is already fire-and-forget (an unawaited promise with no
 * waitUntil), so this never blocks the turn and never throws into it.
 */
export function dispatchToolWebhook(
  toolName: string,
  businessId: string,
  args: Record<string, unknown>,
  resultText: string
): void {
  const event = TOOL_EVENTS[toolName];
  if (!event) return;

  const id = idFromResult(resultText) ?? (typeof args.id === "string" ? args.id : null);

  try {
    dispatchWebhook(businessId, event, {
      ...(id ? { id } : {}),
      source: "assistant",
      tool: toolName,
    });
  } catch {
    // A webhook must never break the user's turn.
  }
}

/** Whether a tool is one we consider a mutation for webhook purposes. */
export function isWebhookTool(toolName: string): boolean {
  return toolName in TOOL_EVENTS;
}
