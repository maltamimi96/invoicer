/**
 * The automation trigger point.
 *
 * Deliberately NOT `dispatchWebhook`. That is a floating unawaited promise, so
 * under serverless the function can return before it finishes and the event is
 * simply lost. That's tolerable for a webhook someone can replay; it is not
 * tolerable for "email this client their onboarding form", where losing the
 * event means the client never hears from you and nothing anywhere says so.
 *
 * So this is awaited, writes a row, and the runner picks it up. The caller
 * pays one INSERT; the work happens out of band.
 *
 * It stores the FACT — (event, entity_type, entity_id) — not a payload. The
 * app's webhook payloads are inconsistent across their 21 dispatch sites and
 * some carry no customer at all, so the runner re-hydrates from the id
 * instead of trusting whatever the caller happened to pass.
 *
 * Plain module: call it from server actions, route handlers and crons.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Sb, name: string) => sb.from(name);

/** Events a rule can trigger on. Only list what actually fires — a trigger
 *  offered in the builder that never happens is worse than one that's absent,
 *  because the user builds on it and waits. */
export const AUTOMATION_TRIGGERS = [
  { event: "customer.created", entity: "customer", label: "A client is added" },
  { event: "lead.created", entity: "lead", label: "A lead comes in" },
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]["event"];

export function triggerLabel(event: string): string {
  return AUTOMATION_TRIGGERS.find((t) => t.event === event)?.label ?? event;
}

/**
 * Queue any automations listening for this event.
 *
 * Never throws: an automation failing to queue must not fail the thing that
 * triggered it. Creating a client succeeds whether or not the follow-up email
 * gets scheduled — the alternative is a broken Save button because a rule was
 * misconfigured.
 */
export async function emitAutomationEvent(
  sb: Sb,
  businessId: string,
  event: AutomationTrigger,
  entityType: string,
  entityId: string,
): Promise<{ queued: number }> {
  try {
    // Plugin off → no rules run. Checked here rather than at every call site.
    const { data: settings } = await tbl(sb, "automations_settings")
      .select("enabled").eq("business_id", businessId).maybeSingle();
    if (!settings?.enabled) return { queued: 0 };

    const { data: rules } = await tbl(sb, "automations")
      .select("id").eq("business_id", businessId).eq("trigger_event", event).eq("enabled", true);
    if (!rules?.length) return { queued: 0 };

    // One row per rule. The unique index on (automation_id, entity_id, event)
    // makes a duplicate emit a no-op rather than a second email.
    const rows = rules.map((r: { id: string }) => ({
      business_id: businessId,
      automation_id: r.id,
      trigger_event: event,
      entity_type: entityType,
      entity_id: entityId,
    }));
    const { error } = await tbl(sb, "automation_runs")
      .upsert(rows, { onConflict: "automation_id,entity_id,trigger_event", ignoreDuplicates: true });
    if (error) throw error;

    return { queued: rows.length };
  } catch (err) {
    console.error("[automations] emit failed", { event, entityId, err });
    return { queued: 0 };
  }
}
