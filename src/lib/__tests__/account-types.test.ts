import { describe, it, expect } from "vitest";
import {
  PRESET_ACCOUNT_TYPES, GENERIC_ACCOUNT_TYPES, resolveAccountTypes, isUsingPresetAccountTypes,
  withCurrentValue, defaultAccountType, humaniseAccountType, validateAccountTypes,
} from "@/lib/customers/account-types";
import { INDUSTRY_PRESETS } from "@/lib/plugins/presets";

describe("resolveAccountTypes", () => {
  it("gives an agency agency types, not strata and builders", () => {
    const values = resolveAccountTypes(null, "agency").map((o) => o.value);
    expect(values).toContain("retainer_client");
    // The whole bug: a marketing agency being asked to classify a client as a
    // body corporate.
    expect(values).not.toContain("strata");
    expect(values).not.toContain("property_mgmt");
    expect(values).not.toContain("builder");
  });

  it("leaves trades exactly as it was", () => {
    expect(resolveAccountTypes(null, "trades").map((o) => o.value))
      .toEqual(["residential", "commercial", "developer", "agent", "builder",
        "strata", "property_mgmt", "government", "non_profit", "other"]);
  });

  it("falls back to the generic list with no preset", () => {
    expect(resolveAccountTypes(null, null)).toEqual(GENERIC_ACCOUNT_TYPES);
    expect(resolveAccountTypes(undefined, "not-a-preset")).toEqual(GENERIC_ACCOUNT_TYPES);
  });

  it("lets a stored list win over the preset", () => {
    const mine = [{ value: "vip", label: "VIP" }];
    expect(resolveAccountTypes(mine, "trades")).toEqual(mine);
    expect(isUsingPresetAccountTypes(mine)).toBe(false);
    expect(isUsingPresetAccountTypes(null)).toBe(true);
  });

  it("ships a type list for every industry preset", () => {
    // A new vertical without one silently gets the generic list — which is how
    // the agency ended up with roofing vocabulary in the first place.
    for (const p of INDUSTRY_PRESETS) {
      expect(PRESET_ACCOUNT_TYPES[p.id], `preset "${p.id}" has no client types`).toBeTruthy();
    }
  });
});

describe("withCurrentValue", () => {
  it("keeps an existing customer's type selectable after a preset switch", () => {
    // Otherwise opening a trades-era customer under the agency preset shows an
    // empty dropdown and rewrites their type on the next save.
    const opts = withCurrentValue(resolveAccountTypes(null, "agency"), "strata");
    expect(opts.map((o) => o.value)).toContain("strata");
    expect(opts.find((o) => o.value === "strata")?.label).toBe("Strata company");
  });

  it("doesn't duplicate a value already in the list", () => {
    const opts = withCurrentValue(resolveAccountTypes(null, "trades"), "residential");
    expect(opts.filter((o) => o.value === "residential")).toHaveLength(1);
  });

  it("handles a customer with no type", () => {
    const base = resolveAccountTypes(null, "trades");
    expect(withCurrentValue(base, null)).toEqual(base);
  });
});

describe("defaults and labels", () => {
  it("starts a new client on the first option of ITS list", () => {
    // Not a hardcoded "residential", which isn't even in the agency list.
    expect(defaultAccountType(resolveAccountTypes(null, "agency"))).toBe("retainer_client");
    expect(defaultAccountType(resolveAccountTypes(null, "trades"))).toBe("residential");
    expect(defaultAccountType([])).toBe("other");
  });

  it("humanises a value no list explains", () => {
    expect(humaniseAccountType("property_mgmt")).toBe("Property manager");
    expect(humaniseAccountType("some_legacy_value")).toBe("Some legacy value");
  });
});

describe("validateAccountTypes", () => {
  it("refuses an empty list — every client is saved with a type", () => {
    expect(validateAccountTypes([])).toMatch(/at least one/i);
  });
  it("refuses duplicate values", () => {
    expect(validateAccountTypes([
      { value: "a", label: "A" }, { value: "a", label: "Also A" },
    ])).toMatch(/share the value/i);
  });
  it("refuses a blank label", () => {
    expect(validateAccountTypes([{ value: "a", label: "  " }])).toMatch(/needs a label/i);
  });
  it("accepts a normal list", () => {
    expect(validateAccountTypes(resolveAccountTypes(null, "agency"))).toBeNull();
  });
});
