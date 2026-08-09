import { describe, it, expect } from "vitest";
import { INDUSTRY_PRESETS, PRESETS_BY_ID } from "./presets";
import { OPTIONAL_PLUGINS, PLUGIN_REGISTRY } from "./registry";

const byId = (id: string) => {
  const p = PRESETS_BY_ID[id];
  if (!p) throw new Error(`preset ${id} missing`);
  return p;
};

describe("the two hubs", () => {
  it("agency is a genuine superset of trades", () => {
    // The product promise is "agencies get everything". Before this was
    // enforced, trades had ~32 modules and agency had 11 — the opposite.
    const trades = new Set(byId("trades").plugins);
    const agency = new Set(byId("agency").plugins);
    const missing = [...trades].filter((p) => !agency.has(p));
    expect(missing).toEqual([]);
  });

  it("agency enables every optional module", () => {
    const agency = new Set(byId("agency").plugins);
    const missing = OPTIONAL_PLUGINS.map((p) => p.id).filter((id) => !agency.has(id));
    expect(missing).toEqual([]);
  });

  it("keeps the trades hub genuinely smaller than everything", () => {
    // The guard against drifting back to "on by default": if trades ever
    // creeps past two-thirds of the catalogue it has stopped being a
    // streamlined hub, which is the whole reason it exists.
    const trades = byId("trades").plugins.length;
    expect(trades).toBeLessThan(OPTIONAL_PLUGINS.length * 0.67);
  });

  it("keeps agency-shaped work out of the trades hub", () => {
    // Named explicitly rather than by count: these are the modules that make a
    // tradie's first login confusing, and a future preset edit that quietly
    // re-adds one should fail here.
    const trades = new Set(byId("trades").plugins);
    for (const id of ["seo-production", "content-studio", "outreach", "prospects", "form-builder"]) {
      expect(trades.has(id)).toBe(false);
    }
  });

  it("gives a tradie what they actually need to trade", () => {
    const trades = new Set(byId("trades").plugins);
    for (const id of ["leads", "quotes", "jobs", "scheduling", "invoicing"]) {
      expect(trades.has(id)).toBe(true);
    }
  });

  it("only names plugins that exist", () => {
    // A typo'd id is silently ignored by the resolver, so the module would
    // just never turn on and nobody would know why.
    const known = new Set(PLUGIN_REGISTRY.map((p) => p.id));
    for (const preset of INDUSTRY_PRESETS) {
      const unknown = preset.plugins.filter((id) => !known.has(id));
      expect({ preset: preset.id, unknown }).toEqual({ preset: preset.id, unknown: [] });
    }
  });

  it("only maps vocab onto real nav paths", () => {
    for (const preset of INDUSTRY_PRESETS) {
      for (const href of Object.keys(preset.vocab ?? {})) {
        expect(href.startsWith("/")).toBe(true);
      }
    }
  });

  it("keeps the agency's own workspace speaking agency", () => {
    // A trade business the agency operates keeps the trades preset and so keeps
    // saying Work Orders; this is the agency's own workspace.
    expect(byId("agency").vocab?.["/work-orders"]).toBe("Projects");
    expect(byId("agency").vocab?.["/quotes"]).toBe("Proposals");
  });
});
