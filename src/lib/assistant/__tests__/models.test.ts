import { describe, it, expect } from "vitest";
import {
  ASSISTANT_MODELS,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  resolveModel,
  resolveEffort,
  modelSupportsThinking,
  modelSupportsEffort,
} from "../models";

describe("model allow-list", () => {
  it("coerces untrusted input to an allowed model", () => {
    expect(resolveModel("claude-sonnet-5")).toBe("claude-sonnet-5");
    // The client picks the model, so anything can arrive here.
    expect(resolveModel("claude-opus-9-nonsense")).toBe(DEFAULT_MODEL);
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
    expect(resolveModel(42)).toBe(DEFAULT_MODEL);
    expect(resolveModel({ id: "x" })).toBe(DEFAULT_MODEL);
  });

  it("coerces untrusted input to an allowed effort", () => {
    expect(resolveEffort("low")).toBe("low");
    expect(resolveEffort("ludicrous")).toBe(DEFAULT_EFFORT);
    expect(resolveEffort(null)).toBe(DEFAULT_EFFORT);
  });

  it("defaults to the most capable model", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-4-8");
  });
});

describe("per-model capabilities", () => {
  /**
   * These are 400s, not no-ops. Sending adaptive thinking to Haiku 4.5 returns
   * "adaptive thinking is not supported on this model" and the turn dies — which
   * is exactly what shipped, because the capability was assumed uniform.
   */
  it("knows Haiku 4.5 supports neither thinking nor effort", () => {
    expect(modelSupportsThinking("claude-haiku-4-5")).toBe(false);
    expect(modelSupportsEffort("claude-haiku-4-5")).toBe(false);
  });

  it("knows the 4.6+ generation supports both", () => {
    for (const id of ["claude-opus-4-8", "claude-sonnet-5"] as const) {
      expect(modelSupportsThinking(id)).toBe(true);
      expect(modelSupportsEffort(id)).toBe(true);
    }
  });

  it("declares a capability for every model the picker offers", () => {
    // A model added without capability flags would silently default to false
    // and quietly lose thinking — or worse, be assumed capable and 400.
    for (const m of ASSISTANT_MODELS) {
      expect(typeof m.thinking, `${m.id} missing thinking flag`).toBe("boolean");
      expect(typeof m.effort, `${m.id} missing effort flag`).toBe("boolean");
    }
  });
});
