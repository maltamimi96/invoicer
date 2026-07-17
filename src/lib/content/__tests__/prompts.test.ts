import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CONTENT_PROMPTS } from "../agent-prompts.generated";
import { CONTENT_AGENTS } from "../pipeline";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs build script, no type declarations.
import { buildPrompts } from "../../../../scripts/build-content-prompts.mjs";

const OUT = "src/lib/content/agent-prompts.generated.ts";

describe("prompt build", () => {
  it("has not drifted from the .md sources", () => {
    // The guard the SEO plugin lacks. Its build script is manual, so editing a
    // prompt and forgetting to run it silently ships the OLD prompt to
    // production — no error, no warning, nothing to notice. `prebuild` makes
    // that near-impossible; this makes it loud.
    const { source } = buildPrompts() as { source: string };
    const onDisk = readFileSync(OUT, "utf8");
    expect(
      onDisk.replace(/\r\n/g, "\n"),
      "agent-prompts.generated.ts is stale — run: node scripts/build-content-prompts.mjs"
    ).toBe(source.replace(/\r\n/g, "\n"));
  });

  it("has a prompt for every agent, and no orphans", () => {
    // A missing prompt is a runtime throw mid-run; an orphan is a file someone
    // is maintaining for nothing.
    const agentIds = CONTENT_AGENTS.map((a) => a.id).sort();
    const promptIds = Object.keys(CONTENT_PROMPTS).sort();
    expect(promptIds).toEqual(agentIds);
  });

  it("gives every agent a substantial prompt", () => {
    for (const [id, prompt] of Object.entries(CONTENT_PROMPTS)) {
      expect(prompt.length, `${id} is suspiciously short`).toBeGreaterThan(400);
    }
  });

  it("keeps metadata out of the prompts", () => {
    // Frontmatter would mean tools/model live in two places — exactly how the
    // SEO prompts and pipeline.ts drifted apart.
    for (const [id, prompt] of Object.entries(CONTENT_PROMPTS)) {
      expect(prompt.startsWith("---"), `${id} has frontmatter`).toBe(false);
    }
  });

  it("writes prompts for a server, not a filesystem agent", () => {
    // The SEO prompts were lifted from Claude Code subagents and tell the model
    // to read/write files. Its engine has to prepend a "there is NO filesystem"
    // override at runtime to undo that. Ours are server-native, so no override
    // is needed — keep it that way.
    for (const [id, prompt] of Object.entries(CONTENT_PROMPTS)) {
      expect(/\bwrite (it |them )?to (a |the )?file\b/i.test(prompt), `${id} tells the model to write files`).toBe(false);
      expect(/\bread (the )?file\b/i.test(prompt), `${id} tells the model to read files`).toBe(false);
    }
  });
});
