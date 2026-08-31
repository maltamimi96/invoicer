import { describe, it, expect } from "vitest";
import { chargeKey, checkoutSessionKey, saveCardSessionKey, customerKey, dayStamp } from "./idempotency";

const INV = "11111111-1111-1111-1111-111111111111";
const INV2 = "22222222-2222-2222-2222-222222222222";
const CUST = "33333333-3333-3333-3333-333333333333";
const BIZ = "44444444-4444-4444-4444-444444444444";

const day1 = new Date("2026-09-01T10:00:00.000Z");
const day1Late = new Date("2026-09-01T23:59:59.000Z");
const day2 = new Date("2026-09-02T00:00:01.000Z");

describe("dayStamp", () => {
  it("is a UTC date, not a local one", () => {
    // 23:00 UTC on the 1st is already the 2nd in Sydney. The key must not
    // depend on where the server happens to be running.
    expect(dayStamp(new Date("2026-09-01T23:00:00.000Z"))).toBe("2026-09-01");
  });
});

describe("chargeKey — the double-charge guard", () => {
  it("is stable for the same invoice, amount and day", () => {
    // The case that matters: an operator double-clicking "Charge saved card".
    expect(chargeKey(INV, 10_000, day1)).toBe(chargeKey(INV, 10_000, day1Late));
  });

  it("differs when the amount differs", () => {
    // A deposit then a balance charge on the same invoice, same day, must both
    // go through.
    expect(chargeKey(INV, 10_000, day1)).not.toBe(chargeKey(INV, 5_000, day1));
  });

  it("differs when the invoice differs", () => {
    expect(chargeKey(INV, 10_000, day1)).not.toBe(chargeKey(INV2, 10_000, day1));
  });

  it("rolls over at the UTC day boundary", () => {
    // A genuine re-charge the next day is allowed through, which is why the
    // protection is a daily bucket rather than a permanent block.
    expect(chargeKey(INV, 10_000, day1Late)).not.toBe(chargeKey(INV, 10_000, day2));
  });

  it("does not collide across amounts that differ by a single minor unit", () => {
    expect(chargeKey(INV, 10_000, day1)).not.toBe(chargeKey(INV, 10_001, day1));
  });

  it("rounds a fractional minor-unit amount rather than emitting a decimal", () => {
    expect(chargeKey(INV, 10_000.4, day1)).toBe(chargeKey(INV, 10_000, day1));
  });
});

describe("checkoutSessionKey", () => {
  it("is stable per invoice, amount and day", () => {
    expect(checkoutSessionKey(INV, 25_000, day1)).toBe(checkoutSessionKey(INV, 25_000, day1Late));
  });

  it("does not collide with a charge key for the same invoice and amount", () => {
    // Different operations. A saved-card charge and a hosted Checkout session
    // for the same invoice on the same day are not the same thing.
    expect(checkoutSessionKey(INV, 25_000, day1)).not.toBe(chargeKey(INV, 25_000, day1));
  });
});

describe("saveCardSessionKey", () => {
  it("is stable per customer per day", () => {
    expect(saveCardSessionKey(CUST, day1)).toBe(saveCardSessionKey(CUST, day1Late));
    expect(saveCardSessionKey(CUST, day1)).not.toBe(saveCardSessionKey(CUST, day2));
  });
});

describe("customerKey", () => {
  it("has no date component — a Stripe customer is created once, ever", () => {
    // Deliberately different from the others. If this rolled daily, a customer
    // could be duplicated on the connected account.
    const key = customerKey(BIZ, CUST);
    expect(key).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(key).toBe(customerKey(BIZ, CUST));
  });

  it("is scoped by business as well as customer", () => {
    expect(customerKey(BIZ, CUST)).not.toBe(customerKey("other-biz", CUST));
  });
});

describe("Stripe's 255-character limit", () => {
  it("throws rather than letting Stripe reject the whole charge", () => {
    expect(() => chargeKey("x".repeat(300), 100, day1)).toThrow(/too long/i);
  });

  it("leaves ample headroom for real UUID-based keys", () => {
    expect(chargeKey(INV, 999_999_99, day1).length).toBeLessThan(80);
  });
});
