/**
 * What an automation can be made of.
 *
 * Plain module — the builder UI, the server actions and the runner all read
 * these lists, so a trigger or action can't exist in one and not another.
 *
 * The rule for adding a trigger: only list events that ACTUALLY fire. A
 * trigger offered in the builder that never happens is worse than one that's
 * missing, because someone builds on it and waits for an email that was never
 * coming.
 */

export interface TriggerDef {
  event: string;
  entity: "customer" | "lead";
  label: string;
  /** What the sentence reads like in the builder: "When a client is added…" */
  hint: string;
}

export const TRIGGERS: TriggerDef[] = [
  {
    event: "customer.created",
    entity: "customer",
    label: "A client is added",
    hint: "Runs once, when the client record is first created.",
  },
  {
    event: "lead.created",
    entity: "lead",
    label: "A lead comes in",
    hint: "Runs when a lead is created — including from a public form.",
  },
];

export interface ActionDef {
  type: string;
  label: string;
  /** Which entities this action can act on. Sending a form needs a customer:
   *  portal links are minted against one, so a lead has no address to send to. */
  entities: Array<"customer" | "lead">;
  /** Config the action needs before it can be saved. */
  needs?: "onboarding_form";
  hint: string;
}

export const ACTIONS: ActionDef[] = [
  {
    type: "send_onboarding_form",
    label: "Email them an onboarding form",
    entities: ["customer"],
    needs: "onboarding_form",
    hint: "Sends the form's portal link. Leads can't receive one — convert them first.",
  },
];

export interface ConditionOpDef { op: string; label: string; needsValue: boolean }

export const CONDITION_OPS: ConditionOpDef[] = [
  { op: "eq", label: "is", needsValue: true },
  { op: "neq", label: "is not", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "set", label: "has any value", needsValue: false },
  { op: "not_set", label: "is empty", needsValue: false },
];

/** Fields worth filtering on, per entity. Deliberately a short list: the
 *  runner compares against the raw row, so offering every column would invite
 *  conditions on things like `updated_at` that read as nonsense. */
export const CONDITION_FIELDS: Record<string, Array<{ field: string; label: string }>> = {
  customer: [
    { field: "account_type", label: "Client type" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "company", label: "Company" },
    { field: "city", label: "City" },
  ],
  lead: [
    { field: "status", label: "Status" },
    { field: "source", label: "Source" },
    { field: "service", label: "Service" },
    { field: "email", label: "Email" },
    { field: "suburb", label: "Suburb" },
  ],
};

export interface AutomationCondition { field: string; op: string; value?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AutomationAction { type: string; [key: string]: any }

export function triggerFor(event: string): TriggerDef | undefined {
  return TRIGGERS.find((t) => t.event === event);
}

export function actionsForTrigger(event: string): ActionDef[] {
  const entity = triggerFor(event)?.entity;
  return entity ? ACTIONS.filter((a) => a.entities.includes(entity)) : [];
}

/**
 * Why this automation can't be saved, or null when it's fine.
 *
 * Runs in the browser before saving and again on the server. Catching it early
 * matters more here than elsewhere: a rule that saves but can never fire looks
 * identical to one that works until the day you notice nobody was emailed.
 */
export function validateAutomation(input: {
  name?: string;
  trigger_event?: string;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
}): string | null {
  if (!input.name?.trim()) return "Give it a name so you can recognise it later.";
  const trigger = triggerFor(input.trigger_event ?? "");
  if (!trigger) return "Choose what starts this automation.";

  const actions = input.actions ?? [];
  if (actions.length === 0) return "Add at least one thing for it to do.";

  const allowed = actionsForTrigger(trigger.event);
  for (const a of actions) {
    const def = allowed.find((d) => d.type === a.type);
    if (!def) {
      const known = ACTIONS.find((d) => d.type === a.type);
      return known
        ? `"${known.label}" can't run on ${trigger.label.toLowerCase()} — ${known.hint}`
        : `Unknown action "${a.type}".`;
    }
    if (def.needs === "onboarding_form" && !a.form_id) {
      return `Choose which form "${def.label}" should send.`;
    }
  }

  for (const c of input.conditions ?? []) {
    if (!c.field) return "Every condition needs a field.";
    const opDef = CONDITION_OPS.find((o) => o.op === c.op);
    if (!opDef) return `Unknown condition "${c.op}".`;
    if (opDef.needsValue && !String(c.value ?? "").trim()) {
      return `The "${opDef.label}" condition needs a value.`;
    }
  }
  return null;
}
