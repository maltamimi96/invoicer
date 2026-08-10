import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveInvite, inviteUrl, sendPublicFormTo } from "./invite";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
  buildBusinessFrom: () => "Biz <forms@biz.kireihq.com>",
}));
vi.mock("@/lib/app-url", () => ({ appUrl: () => "https://app.example.com" }));

const BIZ = "biz-1";

/** Minimal PostgREST-shaped stub: each table is a function returning rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSb(tables: Record<string, any>) {
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (name: string): any => {
    const b = {
      _row: tables[name] ?? null,
      select() { return b; },
      eq() { return b; },
      is() { return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle: async () => ({ data: b._row }),
      single: async () => ({ data: b._row }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert(row: any) {
        (inserted[name] ??= []).push(row);
        return { select: () => ({ single: async () => ({ data: { id: "new-invite" } }) }) };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update(row: any) { (updated[name] ??= []).push(row); return b; },
    };
    return b;
  };
  return { from: builder, _inserted: inserted, _updated: updated };
}

describe("resolveInvite", () => {
  it("returns null for a missing token rather than throwing", async () => {
    // Ordinary public traffic has no token at all — that is not an error.
    const sb = makeSb({});
    expect(await resolveInvite(sb, "form-1", null)).toBeNull();
    expect(await resolveInvite(sb, "form-1", undefined)).toBeNull();
    expect(await resolveInvite(sb, "form-1", "")).toBeNull();
  });

  it("refuses a token minted for a DIFFERENT form", async () => {
    // Otherwise one invite would attach answers from any form on the account.
    const sb = makeSb({
      public_form_invites: { id: "i1", form_id: "other-form", lead_id: "L1", customer_id: null, expires_at: null },
    });
    expect(await resolveInvite(sb, "form-1", "inv_x")).toBeNull();
  });

  it("refuses an expired token", async () => {
    const sb = makeSb({
      public_form_invites: {
        id: "i1", form_id: "form-1", lead_id: "L1", customer_id: null,
        expires_at: "2020-01-01T00:00:00Z",
      },
    });
    expect(await resolveInvite(sb, "form-1", "inv_x")).toBeNull();
  });

  it("resolves a live token to its lead", async () => {
    const sb = makeSb({
      public_form_invites: { id: "i1", form_id: "form-1", lead_id: "L1", customer_id: null, expires_at: null },
    });
    expect(await resolveInvite(sb, "form-1", "inv_x")).toEqual({
      id: "i1", lead_id: "L1", customer_id: null,
    });
  });
});

describe("sendPublicFormTo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to send a draft form", async () => {
    // The link would 404. Better the business hears it than their lead.
    const sb = makeSb({
      public_forms: { id: "f1", name: "Intake", slug: "intake", status: "draft" },
      leads: { id: "L1", name: "Sam", email: "sam@example.com" },
      businesses: { name: "Biz", email: "hi@biz.com", slug: "biz" },
    });
    const res = await sendPublicFormTo(sb, BIZ, "f1", { kind: "lead", id: "L1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/published/i);
  });

  it("reuses an unsubmitted invite instead of minting a second link", async () => {
    // Resending must not scatter live tokens for one questionnaire.
    const sb = makeSb({
      public_forms: { id: "f1", name: "Intake", slug: "intake", status: "published" },
      leads: { id: "L1", name: "Sam", email: "sam@example.com" },
      businesses: { name: "Biz", email: "hi@biz.com", slug: "biz" },
      public_form_invites: { id: "existing", token: "inv_old" },
    });
    const res = await sendPublicFormTo(sb, BIZ, "f1", { kind: "lead", id: "L1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.invite_id).toBe("existing");
      expect(res.url).toContain("inv_old");
    }
    expect(sb._inserted.public_form_invites).toBeUndefined();
  });

  it("succeeds without an email address, returning a copyable link", async () => {
    // A lead captured by phone has no email. That is not a failure — the link
    // still works, it just has to be copied by hand.
    const sb = makeSb({
      public_forms: { id: "f1", name: "Intake", slug: "intake", status: "published" },
      leads: { id: "L1", name: "Sam", email: null },
      businesses: { name: "Biz", email: "hi@biz.com", slug: "biz" },
      public_form_invites: null,
    });
    const res = await sendPublicFormTo(sb, BIZ, "f1", { kind: "lead", id: "L1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.emailed).toBe(false);
      expect(res.url).toContain("/f/intake?i=");
    }
  });

  it("records exactly one subject, never both", async () => {
    // The DB has a CHECK enforcing this; sending the wrong shape would throw
    // at insert time in production.
    const sb = makeSb({
      public_forms: { id: "f1", name: "Intake", slug: "intake", status: "published" },
      leads: { id: "L1", name: "Sam", email: null },
      businesses: { name: "Biz", email: "hi@biz.com", slug: "biz" },
      public_form_invites: null,
    });
    await sendPublicFormTo(sb, BIZ, "f1", { kind: "lead", id: "L1" });
    const row = sb._inserted.public_form_invites[0] as { lead_id: string | null; customer_id: string | null };
    expect(row.lead_id).toBe("L1");
    expect(row.customer_id).toBeNull();
  });
});

describe("inviteUrl", () => {
  it("puts the token in the query string so a forwarded link still works", () => {
    expect(inviteUrl("intake", "inv_abc")).toBe("https://app.example.com/f/intake?i=inv_abc");
  });
});
