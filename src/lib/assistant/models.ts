/**
 * The models and effort levels the assistant may run.
 *
 * Plain module — the picker (client) and the route (server) share it, so the
 * options a user sees are the options the server accepts. The server still
 * validates: an allow-list is only a boundary if the boundary enforces it.
 */

/**
 * Capabilities are per-model and NOT uniform — sending an unsupported one is a
 * hard 400, not a silent no-op. Adaptive thinking arrived with the 4.6
 * generation and `effort` errors outright on Haiku 4.5, so both have to be
 * gated per model rather than sent blanket.
 */
export const ASSISTANT_MODELS = [
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    blurb: "Most capable. Best for multi-step work and anything you'd rather get right first time.",
    thinking: true,
    effort: true,
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Near-Opus quality, faster and cheaper. A good everyday default.",
    thinking: true,
    effort: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest. No thinking or effort control — that's the trade.",
    thinking: false,
    effort: false,
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

const CAPS = new Map<string, { thinking: boolean; effort: boolean }>(
  ASSISTANT_MODELS.map((m) => [m.id, { thinking: m.thinking, effort: m.effort }])
);

/**
 * Whether adaptive thinking may be sent. Sending it to a model without it is a
 * 400 ("adaptive thinking is not supported on this model"), so this gates both
 * the request and the picker — a control that lies is worse than no control.
 */
export function modelSupportsThinking(id: AssistantModel): boolean {
  return CAPS.get(id)?.thinking ?? false;
}

/** Whether output_config.effort may be sent. Also a 400 where unsupported. */
export function modelSupportsEffort(id: AssistantModel): boolean {
  return CAPS.get(id)?.effort ?? false;
}
