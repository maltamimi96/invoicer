import { describe, it, expect } from "vitest";
import {
  labelFor, singularise, applyOrder, isHidden, validateNavConfig,
} from "./config";

describe("labelFor", () => {
  const preset = { "/work-orders": "Projects" };

  it("prefers the business's own override over the preset", () => {
    expect(labelFor("/work-orders", "Work Orders", { labels: { "/work-orders": "Engagements" } }, preset))
      .toBe("Engagements");
  });

  it("falls back to the preset, then to the built-in label", () => {
    expect(labelFor("/work-orders", "Work Orders", null, preset)).toBe("Projects");
    expect(labelFor("/quotes", "Quotes", null, preset)).toBe("Quotes");
    expect(labelFor("/quotes", "Quotes", null, null)).toBe("Quotes");
  });
});

describe("singularise", () => {
  it("handles the endings that appear in this app's nav", () => {
    expect(singularise("Projects")).toBe("Project");
    expect(singularise("Deliveries")).toBe("Delivery");
    expect(singularise("Proposals")).toBe("Proposal");
    expect(singularise("Boxes")).toBe("Box");
  });

  it("leaves a word that isn't a plural alone", () => {
    expect(singularise("Schedule")).toBe("Schedule");
    expect(singularise("Progress")).toBe("Progress");
  });
});

describe("applyOrder", () => {
  const items = [{ href: "/a" }, { href: "/b" }, { href: "/c" }];

  it("sorts by the configured order", () => {
    expect(applyOrder(items, { order: ["/c", "/a", "/b"] }).map((i) => i.href))
      .toEqual(["/c", "/a", "/b"]);
  });

  it("keeps unlisted items rather than dropping them", () => {
    // A nav item shipped after the business reordered must still appear —
    // this is the regression that would silently hide new features.
    const out = applyOrder(items, { order: ["/c"] }).map((i) => i.href);
    expect(out).toContain("/a");
    expect(out).toContain("/b");
    expect(out[0]).toBe("/c");
  });

  it("is a no-op with no order set", () => {
    expect(applyOrder(items, null).map((i) => i.href)).toEqual(["/a", "/b", "/c"]);
    expect(applyOrder(items, { order: [] }).map((i) => i.href)).toEqual(["/a", "/b", "/c"]);
  });
});

describe("isHidden", () => {
  it("only hides what was named", () => {
    expect(isHidden("/tasks", { hidden: ["/tasks"] })).toBe(true);
    expect(isHidden("/leads", { hidden: ["/tasks"] })).toBe(false);
    expect(isHidden("/tasks", null)).toBe(false);
  });
});

describe("validateNavConfig", () => {
  it("accepts a normal config", () => {
    expect(validateNavConfig({ labels: { "/work-orders": "Projects" }, hidden: ["/tasks"] })).toBeNull();
  });

  it("rejects a blank name, an over-long name, and a non-path key", () => {
    expect(validateNavConfig({ labels: { "/a": "  " } })).toMatch(/blank/);
    expect(validateNavConfig({ labels: { "/a": "x".repeat(25) } })).toMatch(/too long/);
    expect(validateNavConfig({ labels: { "work-orders": "Projects" } })).toMatch(/isn't a page/);
  });
});
