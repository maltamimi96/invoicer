import { describe, it, expect } from "vitest";
import { PLUGIN_REGISTRY, PLUGIN_CATEGORIES } from "./registry";
import { navSections } from "@/components/layout/nav-config";

describe("plugin categories", () => {
  it("gives every module a category the store knows how to display", () => {
    // The store renders category-by-category. A module in a category that
    // isn't listed is silently invisible — it can't be turned on at all.
    const known = new Set(PLUGIN_CATEGORIES.map((c) => c.id));
    for (const p of PLUGIN_REGISTRY) {
      expect(known, `${p.id} has category "${p.category}"`).toContain(p.category);
    }
  });

  it("has no empty category", () => {
    // A heading with nothing under it reads as a broken page.
    for (const c of PLUGIN_CATEGORIES) {
      expect(
        PLUGIN_REGISTRY.some((p) => p.category === c.id),
        `category "${c.id}" has no modules`,
      ).toBe(true);
    }
  });

  it("keeps money-out out of whichever section sells", () => {
    // Expenses lived under "Sales" for months. Money going out is not a sale.
    //
    // Found by section CONTENT rather than by name: the original looked up
    // `section === "Sales"`, so renaming the section made the lookup return
    // undefined and the invariant stopped being checked at all.
    const selling = navSections.find((s) => s.items.some((i) => i.href === "/quotes"));
    expect(selling, "no section contains /quotes").toBeDefined();
    expect(selling!.items.map((i) => i.href)).not.toContain("/expenses");
  });
});

describe("nav", () => {
  it("points every item at a plugin that exists", () => {
    // A typo'd plugin id makes the item vanish from the sidebar with no error.
    const ids = new Set(PLUGIN_REGISTRY.map((p) => p.id));
    for (const section of navSections) {
      for (const item of section.items) {
        if (!item.plugin) continue;
        expect(ids, `${item.href} → plugin "${item.plugin}"`).toContain(item.plugin);
      }
    }
  });

  it("has no section holding a single row", () => {
    // The rail carried eleven sections, four of which held ONE item each — a
    // section label and a 24px-radius panel wrapped around a single link. That
    // is what made it read as a stack of boxes rather than as navigation.
    // A one-item section means the item belongs in a neighbouring group.
    for (const s of navSections) {
      expect(s.items.length, `section "${s.section}" holds one row`).toBeGreaterThan(1);
    }
  });

  it("keeps the rail short enough not to need a scrollbar by default", () => {
    // Everything outside the collapsed "More" drawer is on screen at once for
    // a business with every plugin enabled. Past roughly twenty the rail
    // scrolls, and nothing is ever fully visible.
    const alwaysVisible = navSections
      .filter((s) => !s.collapsed)
      .reduce((n, s) => n + s.items.length, 0);
    expect(alwaysVisible).toBeLessThanOrEqual(28);
  });

  it("names each recurring row for what recurs", () => {
    // Three rows called "Recurring", "Recurring billing" and "Recurring costs"
    // sat in three different sections. Nobody could tell them apart.
    const labels = navSections
      .flatMap((s) => s.items)
      .filter((i) => i.label.toLowerCase().includes("recurring"))
      .map((i) => i.label);
    expect(new Set(labels).size, "recurring labels are not distinct").toBe(labels.length);
    for (const l of labels) {
      expect(l.split(" ").length, `"${l}" does not say what recurs`).toBeGreaterThan(1);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
