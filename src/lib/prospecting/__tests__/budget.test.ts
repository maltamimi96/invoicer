import { describe, it, expect } from "vitest";
import {
  placesCost, prospectingSpendStatus, budgetReachedMessage,
  PLACES_CENTS_PER_REQUEST, DEFAULT_PROSPECTING_BUDGET_CENTS,
} from "../budget";

/** Minimal Supabase stub: enough shape for the two queries the meter makes. */
function sbWith(opts: { budgetCents?: number | null; runs?: { cost_cents: unknown }[] }) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => Promise.resolve({ data: opts.runs ?? [] }),
        maybeSingle: () => Promise.resolve({
          data: opts.budgetCents === null
            ? null
            : { prospecting_monthly_budget_cents: opts.budgetCents },
        }),
      };
      void table;
      return chain;
    },
  };
}

describe("placesCost", () => {
  it("prices per request", () => {
    expect(placesCost(10)).toBeCloseTo(PLACES_CENTS_PER_REQUEST * 10, 3);
    expect(placesCost(0)).toBe(0);
  });
});

describe("prospectingSpendStatus", () => {
  it("sums the month's runs against the cap", async () => {
    const s = await prospectingSpendStatus(
      sbWith({ budgetCents: 500, runs: [{ cost_cents: 120 }, { cost_cents: 80 }] }), "b1");
    expect(s.spentCents).toBe(200);
    expect(s.budgetCents).toBe(500);
    expect(s.ok).toBe(true);
  });

  // PostgREST hands back NUMERIC as a string; plain += would build "0120080".
  it("coerces string numerics rather than concatenating them", async () => {
    const s = await prospectingSpendStatus(
      sbWith({ budgetCents: 500, runs: [{ cost_cents: "120.5" }, { cost_cents: "80.25" }] }), "b1");
    expect(s.spentCents).toBeCloseTo(200.75, 2);
    expect(s.ok).toBe(true);
  });

  it("blocks once spend reaches the cap", async () => {
    const s = await prospectingSpendStatus(
      sbWith({ budgetCents: 500, runs: [{ cost_cents: 500 }] }), "b1");
    expect(s.ok).toBe(false);
  });

  // 0 is an explicit opt-out, not "no budget configured" — it must not block.
  it("treats a zero cap as unlimited", async () => {
    const s = await prospectingSpendStatus(
      sbWith({ budgetCents: 0, runs: [{ cost_cents: 99_999 }] }), "b1");
    expect(s.ok).toBe(true);
  });

  it("falls back to the default cap when the business row has none", async () => {
    const s = await prospectingSpendStatus(sbWith({ budgetCents: null, runs: [] }), "b1");
    expect(s.budgetCents).toBe(DEFAULT_PROSPECTING_BUDGET_CENTS);
    expect(s.ok).toBe(true);
  });

  it("reports whose key is paying", async () => {
    const own = await prospectingSpendStatus(sbWith({ budgetCents: 500 }), "b1");
    expect(own.usingPlatformKey).toBe(false);
    const shared = await prospectingSpendStatus(
      sbWith({ budgetCents: 500 }), "b1", { usingPlatformKey: true });
    expect(shared.usingPlatformKey).toBe(true);
  });
});

describe("budgetReachedMessage", () => {
  it("names the amount and where to change it", () => {
    const msg = budgetReachedMessage({
      spentCents: 500, budgetCents: 500, ok: false, usingPlatformKey: true,
    });
    expect(msg).toContain("$5.00");
    expect(msg).toMatch(/raise it/i);
  });
});
