import { describe, it, expect } from "vitest";
import { unwrap, unwrapRows, assertOk } from "../db";

/**
 * The house trap: callers destructure `{ data }` and ignore `{ error }`, so a
 * failed query is indistinguishable from an empty table and the UI renders its
 * empty state. The user believes it and re-enters the data — which is how
 * PR #398's duplicate customer was created.
 *
 * These pin the distinction: a real error throws; genuinely-empty stays empty.
 */

const err = (message: string, code?: string) => ({ data: null, error: { message, code } });

describe("unwrapRows", () => {
  it("throws on a query error instead of returning nothing", () => {
    // The old shape: `const { data } = res; return data ?? []` → [] → "No
    // invoices yet" on a page whose query actually failed.
    const res = err('column "captured_at" does not exist', "42703");
    const swallowed = (res.data as unknown[] | null) ?? [];
    expect(swallowed).toEqual([]); // what the user used to see

    expect(() => unwrapRows(res, "invoices")).toThrowError(/Couldn't load invoices/);
    expect(() => unwrapRows(res, "invoices")).toThrowError(/captured_at/);
  });

  it("returns [] for a genuinely empty table", () => {
    expect(unwrapRows({ data: [], error: null }, "invoices")).toEqual([]);
    expect(unwrapRows({ data: null, error: null }, "invoices")).toEqual([]);
  });

  it("passes rows through untouched", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(unwrapRows({ data: rows, error: null }, "invoices")).toBe(rows);
  });
});

describe("unwrap", () => {
  it("throws on error", () => {
    expect(() => unwrap(err("permission denied for table quotes", "42501"), "quotes"))
      .toThrowError(/Couldn't load quotes: permission denied/);
  });

  it("treats a missing single row as null, not an error", () => {
    // maybeSingle() on a business with no settings row is legitimate.
    expect(unwrap({ data: null, error: null }, "settings")).toBeNull();
  });
});

describe("assertOk", () => {
  it("throws when a write was rejected", () => {
    // addPayment fired this insert without destructuring, so a rejected write
    // returned normally and the UI reported "Payment recorded".
    expect(() => assertOk(err("new row violates row-level security policy", "42501"), "record the payment"))
      .toThrowError(/Couldn't record the payment/);
  });

  it("is silent on success", () => {
    expect(() => assertOk({ error: null }, "record the payment")).not.toThrow();
  });
});
