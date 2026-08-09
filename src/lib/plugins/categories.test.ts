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

  it("keeps money-out out of the sales section", () => {
    // Expenses lived under "Sales" for months. Money going out is not a sale.
    const sales = navSections.find((s) => s.section === "Sales");
    expect(sales?.items.map((i) => i.href)).not.toContain("/expenses");
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

  it("has no duplicate hrefs", () => {
    const hrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
