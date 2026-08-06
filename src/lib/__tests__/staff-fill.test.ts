import { describe, it, expect } from "vitest";
import {
  isStaffFillable, staffFillableFields, staffOnlyCustomerFields,
  stripUnfillableAnswers, missingForStaff, STAFF_UNFILLABLE_TYPES,
} from "@/lib/onboarding/staff-fill";
import type { OnboardingField } from "@/types/database";

const f = (id: string, type: string, extra: Partial<OnboardingField> = {}): OnboardingField =>
  ({ id, type, label: id, ...extra }) as OnboardingField;

const SCHEMA: OnboardingField[] = [
  f("heading", "heading"),
  f("company", "short_text", { required: true }),
  f("abn", "abn"),
  f("logo", "image", { required: true }),
  f("contract", "file"),
  f("wifi", "secure", { required: true }),
];

describe("what staff can fill", () => {
  it("blocks uploads and credentials, allows the rest", () => {
    expect(isStaffFillable(f("a", "short_text"))).toBe(true);
    expect(isStaffFillable(f("a", "file"))).toBe(false);
    expect(isStaffFillable(f("a", "image"))).toBe(false);
    expect(isStaffFillable(f("a", "secure"))).toBe(false);
  });

  it("keeps a credential field off the staff form no matter what", () => {
    // The whole point of `secure` is that the value comes from its owner. If
    // this ever passes, staff are typing customers' passwords into a dashboard.
    expect(STAFF_UNFILLABLE_TYPES.has("secure")).toBe(true);
    expect(staffFillableFields(SCHEMA).some((x) => x.type === "secure")).toBe(false);
  });

  it("splits the schema into fillable and still-needs-the-customer", () => {
    expect(staffFillableFields(SCHEMA).map((x) => x.id)).toEqual(["heading", "company", "abn"]);
    expect(staffOnlyCustomerFields(SCHEMA).map((x) => x.id)).toEqual(["logo", "contract", "wifi"]);
  });
});

describe("stripUnfillableAnswers", () => {
  it("drops answers to upload and credential fields", () => {
    const out = stripUnfillableAnswers(SCHEMA, {
      company: "Acme", logo: { path: "x" }, wifi: "hunter2",
    });
    expect(out).toEqual({ company: "Acme" });
  });

  it("drops answers to fields that aren't on the form", () => {
    expect(stripUnfillableAnswers(SCHEMA, { company: "Acme", ghost: "?" })).toEqual({ company: "Acme" });
  });

  it("drops display-only fields — a heading holds no answer", () => {
    expect(stripUnfillableAnswers(SCHEMA, { heading: "oops" })).toEqual({});
  });

  it("keeps falsy answers that are real values", () => {
    const schema = [f("count", "number"), f("ok", "yes_no")];
    expect(stripUnfillableAnswers(schema, { count: 0, ok: false })).toEqual({ count: 0, ok: false });
  });
});

describe("missingForStaff", () => {
  it("ignores required fields staff physically cannot provide", () => {
    // logo and wifi are both required. Counting them would make the form
    // permanently unsubmittable by staff.
    expect(missingForStaff(SCHEMA, { company: "Acme" })).toEqual([]);
  });

  it("still enforces required fields staff can fill", () => {
    expect(missingForStaff(SCHEMA, {})).toEqual(["company"]);
  });
});
