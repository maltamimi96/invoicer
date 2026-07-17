/**
 * Canonical Claude model IDs.
 *
 * These were hardcoded as string literals at 14 call sites across the AI
 * routes, all pinned to claude-opus-4-6 — two generations stale, with no
 * config, no env override and nothing to grep but the literal itself. Naming
 * them once means the next model bump is one edit, not a hunt.
 *
 * Use the bare aliases: they always resolve to the current snapshot. Appending
 * a date suffix pins you to an old one, which is how
 * `claude-haiku-4-5-20251001` ended up frozen in two crons.
 *
 * Plain module — safe to import anywhere.
 */
export const AI_MODELS = {
  /** Most capable. Multi-step reasoning, agent loops, anything that must be right. */
  smart: "claude-opus-4-8",
  /** Near-Opus quality, faster and cheaper. The sensible middle. */
  balanced: "claude-sonnet-5",
  /** Fastest and cheapest. Classification and bulk work where errors are cheap. */
  fast: "claude-haiku-4-5",
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];
