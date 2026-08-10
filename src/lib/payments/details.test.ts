import { describe, it, expect } from "vitest";
import {
  maskAccount, looksLikeCardNumber, validatePaymentDetail, PAYMENT_KINDS, kindDef,
} from "./details";

describe("no cards, ever", () => {
  it("rejects a card number typed into the account field", () => {
    // The obvious mistake: it's the only box on screen, so someone types the
    // card into it. These are the standard published test PANs.
    for (const pan of ["4242424242424242", "5555555555554444", "378282246310005", "4111 1111 1111 1111"]) {
      expect(looksLikeCardNumber(pan), pan).toBe(true);
      const problem = validatePaymentDetail({ kind: "bank_au", account: pan, routing: "062000" });
      expect(problem, pan).toMatch(/card number/i);
    }
  });

  it("does not mistake a bank account number for a card", () => {
    // A false positive costs someone a retype for no reason, so the guard has
    // to leave ordinary account numbers alone. AU accounts are 6-10 digits.
    for (const acct of ["12345678", "123456789", "1234567890", "00123456"]) {
      expect(looksLikeCardNumber(acct), acct).toBe(false);
    }
  });

  it("rejects a card number in the routing field too", () => {
    const problem = validatePaymentDetail({
      kind: "bank_au", account: "12345678", routing: "4242424242424242",
    });
    expect(problem).toMatch(/card number/i);
  });

  it("refuses card details smuggled into notes", () => {
    // There is no CVV field, so the improvisation is the notes box.
    for (const note of ["cvv 123", "CVC is 456", "card number on file", "security code 999"]) {
      const problem = validatePaymentDetail({
        kind: "bank_au", account: "12345678", routing: "062000", notes: note,
      });
      expect(problem, note).toMatch(/can't be stored/i);
    }
  });

  it("offers no card kind at all", () => {
    // The DB CHECK is the real enforcement; this is the UI's half.
    const values = PAYMENT_KINDS.map((k) => k.value);
    expect(values).not.toContain("card");
    expect(values.some((v) => /card/i.test(v))).toBe(false);
  });
});

describe("masking", () => {
  it("shows the last four and nothing more", () => {
    expect(maskAccount("123456789")).toBe("•••• 6789");
    expect(maskAccount("1234 5678")).toBe("•••• 5678");
  });

  it("reveals nothing at all for a short value", () => {
    // Masking that shows five of six digits is not masking.
    expect(maskAccount("1234")).toBe("••••");
    expect(maskAccount("12")).toBe("••");
    expect(maskAccount("")).toBe("");
  });
});

describe("validation", () => {
  it("requires an account value", () => {
    expect(validatePaymentDetail({ kind: "bank_au", account: "" })).toMatch(/account number/i);
  });

  it("requires the routing value when the kind has one", () => {
    expect(validatePaymentDetail({ kind: "bank_au", account: "12345678" })).toMatch(/bsb/i);
    // PayID has no routing value, so it must not be demanded.
    expect(validatePaymentDetail({ kind: "payid", account: "sam@example.com" })).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(validatePaymentDetail({ kind: "card", account: "12345678" })).toMatch(/valid type/i);
  });

  it("falls back to a real kind rather than throwing", () => {
    expect(kindDef("nonsense").value).toBe("other");
  });
});
