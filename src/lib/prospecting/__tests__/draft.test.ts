import { describe, it, expect } from "vitest";
import { emptyDraft, draftFrom, validateDraft } from "@/components/prospects/hunt-builder";
import type { ProspectHunt } from "@/types/database";

function validDraft() {
  return {
    ...emptyDraft(),
    name: "Western Sydney tradies",
    queries: ["plumber"],
    criteria: "Owner-operators, not franchises",
    area: "Parramatta NSW",
  };
}

describe("validateDraft", () => {
  it("accepts a complete radius hunt", () => {
    expect(validateDraft(validDraft())).toBeNull();
  });

  it("names what is missing rather than failing generically", () => {
    expect(validateDraft({ ...validDraft(), name: "  " })).toMatch(/name/i);
    expect(validateDraft({ ...validDraft(), queries: [] })).toMatch(/search term/i);
    expect(validateDraft({ ...validDraft(), criteria: "" })).toMatch(/prospect/i);
  });

  // The two area modes have different required fields — a radius hunt with no
  // centre and a suburb hunt with no suburbs are both empty searches.
  it("requires a centre in radius mode", () => {
    expect(validateDraft({ ...validDraft(), area: "" })).toMatch(/area/i);
  });

  it("requires at least one suburb in suburb mode", () => {
    const d = { ...validDraft(), area_mode: "suburbs" as const, area: "", suburb_labels: [] };
    expect(validateDraft(d)).toMatch(/suburb/i);
    expect(validateDraft({ ...d, suburb_labels: ["Parramatta NSW"] })).toBeNull();
  });

  it("rejects a half-filled requirement, which would be judged as blank", () => {
    const d = {
      ...validDraft(),
      custom_params: [{ id: "p1", label: "Owner-operator", requirement: "", required: true }],
    };
    expect(validateDraft(d)).toMatch(/requirement/i);
  });
});

describe("draftFrom", () => {
  const hunt = {
    id: "h", business_id: "b", name: "Hunt", queries: ["plumber"],
    centre_label: "Parramatta NSW", centre_lat: -33.8, centre_lng: 151.0,
    radius_m: 15000, criteria: "c", filters: { no_website: true },
    target_count: 40, area_mode: "suburbs",
    suburbs: [{ label: "Westmead", lat: -33.8, lng: 151.0, radius_m: 5000 }],
    custom_params: [{ id: "p1", label: "L", requirement: "R", required: true }],
    active: true, created_by: null, created_at: "", updated_at: "",
  } as unknown as ProspectHunt;

  it("round-trips an existing hunt into an editable draft", () => {
    const d = draftFrom(hunt);
    expect(d.target_count).toBe(40);
    expect(d.area_mode).toBe("suburbs");
    expect(d.suburb_labels).toEqual(["Westmead"]);
    expect(d.radius_km).toBe(15);
    expect(d.custom_params).toHaveLength(1);
    expect(validateDraft(d)).toBeNull();
  });

  // Older hunts predate these columns; the editor must not open blank on them.
  it("fills defaults for a hunt saved before v2", () => {
    const legacy = { ...hunt, target_count: undefined, area_mode: undefined,
      suburbs: undefined, custom_params: undefined } as unknown as ProspectHunt;
    const d = draftFrom(legacy);
    expect(d.target_count).toBe(20);
    expect(d.area_mode).toBe("radius");
    expect(d.suburb_labels).toEqual([]);
    expect(d.custom_params).toEqual([]);
  });
});
