import { describe, it, expect } from "vitest";
import {
  CONTENT_AGENTS,
  CONTENT_AGENTS_BY_ID,
  CONTENT_ARTIFACTS,
  executableSteps,
  validPlatforms,
  PLATFORMS,
} from "../pipeline";

describe("content agent registry", () => {
  it("gives every agent a prompt-matching id and no duplicates", () => {
    const ids = CONTENT_AGENTS.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
    // The id IS the prompt filename — agents/<id>.md. A mismatch is a runtime
    // "No prompt for agent" throw, so keep them boring and lowercase.
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("only produces and consumes declared artifact keys", () => {
    const keys = new Set(Object.keys(CONTENT_ARTIFACTS));
    for (const a of CONTENT_AGENTS) {
      for (const k of [...a.produces, ...a.consumes]) {
        expect(keys.has(k), `${a.id} references unknown artifact "${k}"`).toBe(true);
      }
    }
  });

  it("has no agent consuming an artifact nothing produces", () => {
    // The SEO plugin's keyword-strategist consumes "opportunities", which
    // nothing ever writes — so its research is silently thrown away. This test
    // exists so that can't happen here.
    const produced = new Set(CONTENT_AGENTS.flatMap((a) => a.produces));
    for (const a of CONTENT_AGENTS) {
      for (const k of a.consumes) {
        expect(produced.has(k), `${a.id} consumes "${k}" but no agent produces it`).toBe(true);
      }
    }
  });

  it("puts strategy on the bigger model and rendering on the cheaper one", () => {
    expect(CONTENT_AGENTS_BY_ID["topic-scout"].model).toBe("opus");
    expect(CONTENT_AGENTS_BY_ID["angle-strategist"].model).toBe("opus");
    expect(CONTENT_AGENTS_BY_ID["platform-adapter"].model).toBe("sonnet");
  });

  it("only gives web search to the agents that need live facts", () => {
    const withSearch = CONTENT_AGENTS.filter((a) => a.tools.includes("web_search")).map((a) => a.id);
    expect(withSearch.sort()).toEqual(["editor-compliance", "topic-scout"]);
  });
});

describe("executableSteps", () => {
  it("keeps the scout out of the chain", () => {
    // topic-scout is discovery-track: it runs standalone and seeds topics. Its
    // output reaches the chain via the piece's `research` artifact.
    for (const kind of ["script", "post", "hooks"] as const) {
      expect(executableSteps(kind).map((s) => s.id)).not.toContain("topic-scout");
    }
  });

  it("routes to the right writer for the kind", () => {
    expect(executableSteps("script").map((s) => s.id)).toContain("script-writer");
    expect(executableSteps("script").map((s) => s.id)).not.toContain("caption-writer");
    expect(executableSteps("post").map((s) => s.id)).toContain("caption-writer");
    expect(executableSteps("post").map((s) => s.id)).not.toContain("script-writer");
  });

  it("stops a hooks pack after the hooks", () => {
    // A hooks pack is a deliverable on its own — there's nothing to voice or
    // adapt, so paying for those steps would be waste.
    expect(executableSteps("hooks").map((s) => s.id)).toEqual([
      "angle-strategist",
      "hook-writer",
    ]);
  });

  it("orders every chain so each step's inputs already exist", () => {
    // Guards the ordering bug: a step that consumes an artifact a later step
    // produces would run on nothing, silently.
    for (const kind of ["script", "post", "hooks"] as const) {
      const available = new Set<string>(["research"]); // written at piece creation
      for (const step of executableSteps(kind)) {
        for (const need of step.consumes) {
          expect(
            available.has(need),
            `${kind}: ${step.id} consumes "${need}" before anything produces it`
          ).toBe(true);
        }
        step.produces.forEach((p) => available.add(p));
      }
    }
  });

  it("never returns an undefined step", () => {
    for (const kind of ["script", "post", "hooks"] as const) {
      for (const step of executableSteps(kind)) expect(step).toBeDefined();
    }
  });
});

describe("validPlatforms", () => {
  it("keeps known platforms and drops everything else", () => {
    expect(validPlatforms(["instagram", "tiktok"])).toEqual(["instagram", "tiktok"]);
    expect(validPlatforms(["instagram", "myspace"])).toEqual(["instagram"]);
  });

  it("survives junk — the client sends this", () => {
    expect(validPlatforms(null)).toEqual([]);
    expect(validPlatforms("instagram")).toEqual([]);
    expect(validPlatforms([1, {}, null])).toEqual([]);
  });

  it("covers the platforms that were asked for", () => {
    const ids = PLATFORMS.map((p) => p.id);
    for (const p of ["instagram", "facebook", "tiktok", "linkedin", "youtube"]) {
      expect(ids).toContain(p);
    }
  });
});
