/**
 * The models and effort levels the assistant may run.
 *
 * Plain module — the picker (client) and the route (server) share it, so the
 * options a user sees are the options the server accepts. The server still
 * validates: an allow-list is only a boundary if the boundary enforces it.
 */

export const ASSISTANT_MODELS = [
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    blurb: "Most capable. Best for multi-step work and anything you'd rather get right first time.",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Near-Opus quality, faster and cheaper. A good everyday default.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest. Good for quick lookups and simple edits.",
  },
] as const;

export type AssistantModel = (typeof ASSISTANT_MODELS)[number]["id"];

export const DEFAULT_MODEL: AssistantModel = "claude-opus-4-8";

/**
 * Effort moves the intelligence/latency/cost tradeoff more than the model
 * choice does on this generation, so it's a first-class control rather than a
 * hidden constant.
 */
export const ASSISTANT_EFFORTS = [
  { id: "low", label: "Quick", blurb: "Short, scoped tasks. Least thinking." },
  { id: "medium", label: "Balanced", blurb: "Cheaper, still capable." },
  { id: "high", label: "Thorough", blurb: "The default. Best balance for most work." },
  { id: "xhigh", label: "Maximum", blurb: "Hardest multi-step jobs. Slowest." },
] as const;

export type AssistantEffort = (typeof ASSISTANT_EFFORTS)[number]["id"];

/** `high` is also the API default; naming it keeps intent explicit. */
export const DEFAULT_EFFORT: AssistantEffort = "high";

const MODEL_IDS = new Set<string>(ASSISTANT_MODELS.map((m) => m.id));
const EFFORT_IDS = new Set<string>(ASSISTANT_EFFORTS.map((e) => e.id));

/** Coerce untrusted input to an allowed model, falling back to the default. */
export function resolveModel(value: unknown): AssistantModel {
  return typeof value === "string" && MODEL_IDS.has(value)
    ? (value as AssistantModel)
    : DEFAULT_MODEL;
}

/** Coerce untrusted input to an allowed effort, falling back to the default. */
export function resolveEffort(value: unknown): AssistantEffort {
  return typeof value === "string" && EFFORT_IDS.has(value)
    ? (value as AssistantEffort)
    : DEFAULT_EFFORT;
}
