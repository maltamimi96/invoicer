import { describe, it, expect } from "vitest";
import {
  resolveCustomerFields, isUsingPresetDefaults, pruneAnswers,
  PRESET_CUSTOMER_FIELDS, GENERIC_CUSTOMER_FIELDS,
} from "@/lib/customers/field-schema";
import { INDUSTRY_PRESETS } from "@/lib/plugins/presets";
import type { OnboardingField } from "@/types/database";

describe("preset field sets", () => {
  it("gives a trades business site fields and an agency retainer fields", () => {
    // The whole point: the same screen must read correctly for both.
    const trades = PRESET_CUSTOMER_FIELDS.trades.map((f) => f.id);
    const agency = PRESET_CUSTOMER_FIELDS.agency.map((f) => f.id);
    expect(trades).toContain("property_type");
    expect(trades).toContain("access_notes");
    expect(agency).toContain("monthly_retainer");
    expect(agency).toContain("instagram");
    // And crucially, neither leaks into the other.
    expect(agency).not.toContain("property_type");
    expect(trades).not.toContain("monthly_retainer");
  });

  it("covers every industry preset that ships", () => {
    // A preset with no field set would silently fall back to generic, which
    // looks like a bug to whoever picked that industry.
    for (const preset of INDUSTRY_PRESETS) {
      expect(PRESET_CUSTOMER_FIELDS[preset.id], `no client fields for preset "${preset.id}"`).toBeDefined();
    }
  });

  it("uses unique ids within each preset", () => {
    // Duplicate ids would make one answer overwrite another.
    for (const [preset, fields] of Object.entries(PRESET_CUSTOMER_FIELDS)) {
      const ids = fields.map((f) => f.id);
      expect(new Set(ids).size, `duplicate id in "${preset}"`).toBe(ids.length);
    }
  });

  it("never puts a secure field on a client profile", () => {
    // A profile is visible to anyone who can see the customer — the wrong home
    // for a credential, regardless of whether the key is configured.
    for (const fields of Object.values(PRESET_CUSTOMER_FIELDS)) {
      expect(fields.some((f) => f.type === "secure")).toBe(false);
    }
  });
});

describe("resolveCustomerFields", () => {
  it("falls back to the preset when nothing is stored", () => {
    expect(resolveCustomerFields(null, "agency")).toEqual(PRESET_CUSTOMER_FIELDS.agency);
    expect(resolveCustomerFields(undefined, "trades")).toEqual(PRESET_CUSTOMER_FIELDS.trades);
  });

  it("falls back to generic for an unknown or missing preset", () => {
    expect(resolveCustomerFields(null, null)).toEqual(GENERIC_CUSTOMER_FIELDS);
    expect(resolveCustomerFields(null, "not-a-preset")).toEqual(GENERIC_CUSTOMER_FIELDS);
  });

  it("lets a stored schema override the preset", () => {
    const custom: OnboardingField[] = [{ id: "x", type: "short_text", label: "X" }];
    expect(resolveCustomerFields(custom, "agency")).toEqual(custom);
  });

  it("treats an empty array as a deliberate choice, NOT as unset", () => {
    // Falling back to the preset here would make "no extra fields" impossible
    // to configure — you'd clear them and they'd come straight back.
    expect(resolveCustomerFields([], "trades")).toEqual([]);
    expect(isUsingPresetDefaults([])).toBe(false);
    expect(isUsingPresetDefaults(null)).toBe(true);
  });
});

describe("pruneAnswers", () => {
  const fields: OnboardingField[] = [
    { id: "keep", type: "short_text", label: "Keep" },
    { id: "also", type: "number", label: "Also" },
  ];

  it("drops answers whose field no longer exists", () => {
    // An orphan is invisible in the UI but would resurface if the id were
    // reused — showing one client's data under a different label.
    expect(pruneAnswers({ keep: "a", removed: "b", also: 2 }, fields))
      .toEqual({ keep: "a", also: 2 });
  });

  it("preserves falsy answers, which are real values", () => {
    // 0, "" and false must survive — dropping them would silently lose data.
    expect(pruneAnswers({ keep: "", also: 0 }, fields)).toEqual({ keep: "", also: 0 });
  });

  it("handles null and undefined input", () => {
    expect(pruneAnswers(null, fields)).toEqual({});
    expect(pruneAnswers(undefined, fields)).toEqual({});
  });

  it("returns nothing when the schema is empty", () => {
    expect(pruneAnswers({ a: 1 }, [])).toEqual({});
  });
});
