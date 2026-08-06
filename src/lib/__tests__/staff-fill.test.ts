import { describe, it, expect } from "vitest";
import {
  isStaffFillable, staffFillableFields, staffOnlyCustomerFields,
  stripUnfillableAnswers, missingForStaff, STAFF_UPLOAD_TYPES,
  staffFillProblems, staffFillErrorMessage,
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

const WITH_KEY = { allowSecure: true };

describe("what staff can fill", () => {
  it("never allows uploads — there is no dashboard upload path", () => {
    expect(isStaffFillable(f("a", "short_text"))).toBe(true);
    expect(STAFF_UPLOAD_TYPES.has("file")).toBe(true);
    expect(STAFF_UPLOAD_TYPES.has("image")).toBe(true);
    // True even with a key: allowSecure is about credentials, not uploads.
    expect(isStaffFillable(f("a", "file"), WITH_KEY)).toBe(false);
    expect(isStaffFillable(f("a", "image"), WITH_KEY)).toBe(false);
  });

  it("allows a credential only when there's a key to encrypt it with", () => {
    // Staff legitimately hold details a client handed over (a BSB, an account
    // number). Without a key there is nothing to encrypt with, and a
    // credential is never stored in the clear.
    expect(isStaffFillable(f("a", "secure"))).toBe(false);
    expect(isStaffFillable(f("a", "secure"), WITH_KEY)).toBe(true);
  });

  it("splits the schema into fillable and still-needs-the-customer", () => {
    expect(staffFillableFields(SCHEMA).map((x) => x.id)).toEqual(["heading", "company", "abn"]);
    expect(staffOnlyCustomerFields(SCHEMA).map((x) => x.id)).toEqual(["logo", "contract", "wifi"]);

    expect(staffFillableFields(SCHEMA, WITH_KEY).map((x) => x.id)).toEqual(["heading", "company", "abn", "wifi"]);
    expect(staffOnlyCustomerFields(SCHEMA, WITH_KEY).map((x) => x.id)).toEqual(["logo", "contract"]);
  });
});

describe("stripUnfillableAnswers", () => {
  it("drops what it can't keep AND reports it", () => {
    // The silent version of this lost an account number and the response page
    // said "Not answered". Dropping is fine; dropping quietly is not.
    const out = stripUnfillableAnswers(SCHEMA, {
      company: "Acme", logo: { path: "x" }, wifi: "hunter2",
    });
    expect(out.clean).toEqual({ company: "Acme" });
    expect(out.dropped.sort()).toEqual(["logo", "wifi"]);
  });

  it("keeps a credential when there's a key", () => {
    const out = stripUnfillableAnswers(SCHEMA, { wifi: "hunter2" }, WITH_KEY);
    expect(out.clean).toEqual({ wifi: "hunter2" });
    expect(out.dropped).toEqual([]);
  });

  it("doesn't report a field that was left empty anyway", () => {
    expect(stripUnfillableAnswers(SCHEMA, { logo: "" }).dropped).toEqual([]);
  });

  it("drops answers to fields that aren't on the form, silently", () => {
    const out = stripUnfillableAnswers(SCHEMA, { company: "Acme", ghost: "?" });
    expect(out.clean).toEqual({ company: "Acme" });
    expect(out.dropped).toEqual([]);
  });

  it("drops display-only fields — a heading holds no answer", () => {
    expect(stripUnfillableAnswers(SCHEMA, { heading: "oops" }).clean).toEqual({});
  });

  it("keeps falsy answers that are real values", () => {
    const schema = [f("count", "number"), f("ok", "yes_no")];
    expect(stripUnfillableAnswers(schema, { count: 0, ok: false }).clean).toEqual({ count: 0, ok: false });
  });
});

describe("staffFillProblems", () => {
  // This is what the add-client screen runs BEFORE creating the client. It
  // used to run only on the server, afterwards — so a missing field left the
  // client created and the form lost.
  it("names the field, not just 'invalid'", () => {
    const schema = [f("company", "short_text", { required: true, label: "Company name" })];
    const problems = staffFillProblems(schema, {});
    expect(problems).toEqual([{ field_id: "company", label: "Company name", message: "is required" }]);
    expect(staffFillErrorMessage(problems)).toBe("Company name is required");
  });

  it("catches bad formats too", () => {
    const schema = [f("email", "email", { label: "Work email" })];
    const problems = staffFillProblems(schema, { email: "not-an-email" });
    expect(problems).toHaveLength(1);
    expect(problems[0].label).toBe("Work email");
  });

  it("doesn't complain twice about one empty field", () => {
    // Empty + required must not also report "invalid format".
    const schema = [f("email", "email", { required: true, label: "Work email" })];
    expect(staffFillProblems(schema, { email: "" })).toHaveLength(1);
  });

  it("ignores upload and credential fields left empty", () => {
    expect(staffFillProblems(SCHEMA, { company: "Acme" })).toEqual([]);
  });

  it("refuses to save silently when an answer can't be kept", () => {
    const problems = staffFillProblems(SCHEMA, { company: "Acme", wifi: "hunter2" });
    expect(problems).toHaveLength(1);
    expect(problems[0].label).toBe("wifi");
    expect(problems[0].message).toMatch(/wasn't saved/);
  });

  it("lists every problem, so one fix at a time isn't needed", () => {
    const schema = [
      f("a", "short_text", { required: true, label: "A" }),
      f("b", "short_text", { required: true, label: "B" }),
    ];
    expect(staffFillErrorMessage(staffFillProblems(schema, {}))).toBe("Fix these first: A is required, B is required");
  });

  it("says nothing when the form is complete", () => {
    expect(staffFillErrorMessage(staffFillProblems(SCHEMA, { company: "Acme" }))).toBe("");
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
