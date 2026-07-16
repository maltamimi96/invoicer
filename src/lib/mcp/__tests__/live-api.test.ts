import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_TOOLS } from "../anthropic-tools";
import {
  ASSISTANT_MODELS,
  modelSupportsThinking,
  modelSupportsEffort,
} from "@/lib/assistant/models";

/**
 * Live API probe — costs money, so it's opt-in:
 *
 *   RUN_LIVE_API=1 npx vitest run src/lib/mcp/__tests__/live-api.test.ts
 *
 * It exists because there is no offline validator for tool schemas. The only
 * way to know all ~196 generated schemas are well-formed is to send them: a
 * schema the API rejects is a 400 at runtime, in the user's face. It also
 * pins the exact request shape the assistant uses (adaptive thinking + effort
 * + prompt caching on Opus 4.8), which is where the 400s on this generation
 * live (budget_tokens and temperature are both rejected).
 */
const live = process.env.RUN_LIVE_API === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!live)("live API contract", () => {
  const client = new Anthropic();

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      // Padded: the cacheable prefix has a minimum size, but the 196 tool
      // schemas render before system and carry it well past that on their own.
      text: "You are a test harness for Kirei's assistant. Answer in one short sentence.",
      cache_control: { type: "ephemeral" },
    },
  ];

  const ask = () =>
    client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      tools: ANTHROPIC_TOOLS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
    });

  it("accepts all generated tool schemas", async () => {
    const res = await ask();
    // Reaching here at all means the API accepted every schema.
    expect(res.stop_reason).not.toBe("refusal");
    expect(res.usage.input_tokens).toBeGreaterThan(0);
  }, 120_000);

  it("caches the tools+system prefix across calls", async () => {
    await ask();
    const second = await ask();
    // If this is 0, the prefix isn't stable and every turn re-reads ~196 tool
    // schemas at full price — the single largest cost in the old agent.
    expect(second.usage.cache_read_input_tokens ?? 0).toBeGreaterThan(0);
  }, 120_000);

  // The gap that let a 400 ship: the checks above only exercised Opus, so the
  // picker was "verified" on one model out of three. Haiku 4.5 rejects both
  // adaptive thinking and effort — a hard 400, not a no-op. Every model the
  // picker offers must be sent exactly the way the route sends it.
  it.each(ASSISTANT_MODELS.map((m) => [m.id, m] as const))(
    "accepts the exact request shape the route builds for %s",
    async (_id, m) => {
      const res = await client.messages.create({
        model: m.id,
        max_tokens: 1024,
        system,
        tools: ANTHROPIC_TOOLS,
        // Mirrors the route's conditional construction. If this drifts from
        // route.ts, this test stops guarding anything.
        ...(modelSupportsThinking(m.id) ? { thinking: { type: "adaptive" as const } } : {}),
        ...(modelSupportsEffort(m.id) ? { output_config: { effort: "low" as const } } : {}),
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      });
      expect(res.stop_reason).not.toBe("refusal");
      expect(res.usage.input_tokens).toBeGreaterThan(0);
    },
    120_000
  );

  it("lets the model find the right tool among ~196", async () => {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: [{ type: "text", text: "You are the Kirei assistant. Use tools when asked." }],
      tools: ANTHROPIC_TOOLS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "List my customers." }],
    });
    const picked = res.content.find((b) => b.type === "tool_use");
    expect(picked?.type === "tool_use" ? picked.name : null).toBe("list_customers");
  }, 120_000);
});
