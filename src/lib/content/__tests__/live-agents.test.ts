import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "@/lib/ai/models";
import { CONTENT_PROMPTS } from "../agent-prompts.generated";
import { AGENT_SCHEMAS } from "../schemas";
import { renderBrand } from "../engine";
import type { ContentBrand } from "@/types/database";

/**
 * Live probe — costs money, opt-in:
 *
 *   RUN_LIVE_API=1 npx vitest run src/lib/content/__tests__/live-agents.test.ts
 *
 * There is no offline validator for a tool schema. The SEO engine's equivalent
 * failure mode is silent — it asks for "ONLY a JSON array" and then string-slices
 * the reply, so a malformed schema or a chatty model just kills the run at
 * runtime. These send the real schemas and assert the shape comes back.
 */
const live = process.env.RUN_LIVE_API === "1" && !!process.env.ANTHROPIC_API_KEY;

const CROWN: ContentBrand = {
  id: "test",
  business_id: "test",
  customer_id: null,
  name: "Crown Roofers",
  industry: "Roofing",
  services: ["Roof restoration", "Leak repairs", "Gutter replacement", "Storm damage"],
  service_area: "Western Sydney, NSW, Australia",
  audience: "Homeowners 35-65 in older brick homes; some strata managers",
  voice: "Straight-talking tradie. No jargon, no hype. Explains the why, gives a real number.",
  tone: "Direct, warm, unimpressed by nonsense",
  proof_points: "Licensed NSW builder. 18 years trading. 10-year workmanship warranty.",
  banned_phrases: ["game-changer", "unlock", "in today's fast-paced world", "elevate"],
  examples: null,
  profile: {},
  status: "active",
  created_at: "",
  updated_at: "",
};

describe.skipIf(!live)("live content agents", () => {
  const client = new Anthropic();

  it("accepts the angle-strategist schema and returns distinct angles", async () => {
    const schema = AGENT_SCHEMAS["angle-strategist"];
    const res = await client.messages.create({
      model: AI_MODELS.smart,
      max_tokens: 4096,
      system: CONTENT_PROMPTS["angle-strategist"],
      tools: [
        {
          name: schema.toolName,
          description: schema.description,
          input_schema: schema.input_schema as Anthropic.Tool.InputSchema,
        },
      ],
      // Forced — the whole point. No prose to dig through.
      tool_choice: { type: "tool", name: schema.toolName },
      messages: [
        {
          role: "user",
          content: `${renderBrand(CROWN)}\n\nTopic: Why your roof leaks in heavy rain but not light rain\nAngles wanted: 3\n\nCall ${schema.toolName}.`,
        },
      ],
    });

    const call = res.content.find((b) => b.type === "tool_use");
    expect(call?.type === "tool_use" ? call.name : null).toBe(schema.toolName);

    const angles = (call as Anthropic.ToolUseBlock).input as { angles: Array<Record<string, string>> };
    expect(angles.angles.length).toBe(3);
    for (const a of angles.angles) {
      expect(a.label).toBeTruthy();
      expect(a.emotion).toBeTruthy();
    }
    // The point of the agent: different emotions, not reworded duplicates.
    const emotions = angles.angles.map((a) => a.emotion.toLowerCase());
    expect(new Set(emotions).size).toBeGreaterThan(1);
  }, 120_000);

  it("respects banned phrases", async () => {
    // The brand contract. If this leaks, the voice layer is decorative.
    const schema = AGENT_SCHEMAS["caption-writer"];
    const res = await client.messages.create({
      model: AI_MODELS.balanced,
      max_tokens: 3000,
      system: CONTENT_PROMPTS["caption-writer"],
      tools: [
        {
          name: schema.toolName,
          description: schema.description,
          input_schema: schema.input_schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: schema.toolName },
      messages: [
        {
          role: "user",
          content:
            `${renderBrand(CROWN)}\n\nTopic: Why your roof leaks in heavy rain but not light rain\n` +
            `Angles wanted: 1\n\n## Input — angles\n` +
            `[{"label":"the one about the money","who":"homeowner who got a cheap quote","emotion":"fear"}]\n\n` +
            `Call ${schema.toolName}.`,
        },
      ],
    });

    const call = res.content.find((b) => b.type === "tool_use");
    const out = JSON.stringify((call as Anthropic.ToolUseBlock)?.input ?? {}).toLowerCase();
    for (const banned of CROWN.banned_phrases) {
      expect(out, `emitted a banned phrase: "${banned}"`).not.toContain(banned.toLowerCase());
    }
  }, 120_000);

  it("lets the scout search and still submit its schema", async () => {
    // Two things this guards, both learned the hard way:
    //
    // 1. Web search is a server tool and can't coexist with a forced
    //    tool_choice, so the scout must CHOOSE to submit. If it reliably
    //    doesn't, the engine's "finished without submitting" error fires.
    // 2. It is SLOW — measured at over four minutes with search. That's why
    //    the scout is a queued job and not an inline server action, and why
    //    this timeout is 8 minutes rather than the default.
    const schema = AGENT_SCHEMAS["topic-scout"];
    const res = await client.messages.create({
      model: AI_MODELS.smart,
      max_tokens: 8192,
      system: CONTENT_PROMPTS["topic-scout"],
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 4 } as unknown as Anthropic.Tool,
        {
          name: schema.toolName,
          description: schema.description,
          input_schema: schema.input_schema as Anthropic.Tool.InputSchema,
        },
      ],
      messages: [
        {
          role: "user",
          content: `${renderBrand(CROWN)}\n\nToday's date: 2026-07-17.\n\nResearch the niche, then call ${schema.toolName}.`,
        },
      ],
    });

    const call = res.content.find((b) => b.type === "tool_use" && b.name === schema.toolName);
    expect(call, "the scout never called submit_topics").toBeDefined();
    const topics = (call as Anthropic.ToolUseBlock).input as { topics: Array<{ title: string }> };
    expect(topics.topics.length).toBeGreaterThanOrEqual(5);
  }, 480_000);
});
