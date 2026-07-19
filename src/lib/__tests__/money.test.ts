import { describe, it, expect } from "vitest";
import { num, sumMoney, formatCurrency } from "../utils";

/**
 * Postgres `numeric` columns arrive from PostgREST as STRINGS while the
 * TypeScript types claim `number`. Summing them with `+` concatenates.
 *
 * These tests reproduce the exact shipped bug: the invoices list "Paid" KPI,
 * the customer "Total spent", and the products "Catalog value" all rendered
 * `$NaN` — but only for a business with two or more rows, which is why it
 * survived review and shipped.
 */

describe("num", () => {
  it("coerces the strings PostgREST actually returns", () => {
    expect(num("500.00")).toBe(500);
    expect(num("0.05")).toBe(0.05);
    expect(num(250)).toBe(250);
  });

  it("falls back to 0 rather than producing NaN", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("")).toBe(0);
    expect(num("not a number")).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
  });
});

describe("sumMoney", () => {
  it("adds string amounts instead of concatenating them", () => {
    // The bug, precisely: 0 + "500.00" + "250.00" === "0500.00250.00"
    const rows = [{ total: "500.00" }, { total: "250.00" }];

    const broken = rows.reduce<number>((s, r) => s + (r.total as unknown as number), 0);
    expect(String(broken)).toBe("0500.00250.00");
    expect(formatCurrency(Number(broken))).toContain("NaN");

    expect(sumMoney(rows, (r) => r.total)).toBe(750);
    expect(formatCurrency(sumMoney(rows, (r) => r.total))).not.toContain("NaN");
  });

  it("is correct with 0 and 1 rows — which is why the bug shipped", () => {
    expect(sumMoney([], (r: { total: string }) => r.total)).toBe(0);
    expect(sumMoney([{ total: "500.00" }], (r) => r.total)).toBe(500);
  });

  it("handles a computed expression per row", () => {
    const rows = [
      { total: "500.00", amount_paid: "100.00" },
      { total: "250.00", amount_paid: "250.00" },
    ];
    expect(sumMoney(rows, (r) => num(r.total) - num(r.amount_paid))).toBe(400);
  });

  it("survives null amounts mixed in", () => {
    const rows = [{ unit_price: "12.50" }, { unit_price: null }, { unit_price: "7.50" }];
    expect(sumMoney(rows, (r) => r.unit_price)).toBe(20);
  });
});

describe("the paid-confetti comparison", () => {
  it("fires when a string amount_paid closes the invoice", () => {
    // Was: "100.00" + 50 → "100.0050", so the >= never became true and an
    // invoice reached paid with no confetti.
    const invoice = { amount_paid: "100.00", total: "150.00" };
    const paid = 50;

    const broken = ((invoice.amount_paid as unknown as number) + paid + 0.005) >= Number(invoice.total);
    expect(broken).toBe(false);

    const fixed = (num(invoice.amount_paid) + paid + 0.005) >= num(invoice.total);
    expect(fixed).toBe(true);
  });
});
