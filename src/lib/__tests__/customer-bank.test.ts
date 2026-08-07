import { describe, it, expect } from "vitest";
import {
  validateBankDetails, formatBsb, digitsOnly, accountLast3, maskedAccount,
} from "@/lib/customers/bank";

describe("validateBankDetails", () => {
  it("accepts nothing entered — bank details are optional", () => {
    expect(validateBankDetails({})).toBeNull();
    expect(validateBankDetails({ bsb: "", accountNumber: "", accountName: "" })).toBeNull();
  });

  it("refuses half a set", () => {
    // A BSB with no account number can't be debited, and storing it would make
    // the client look set up for direct debit when they aren't.
    expect(validateBankDetails({ bsb: "062000" })).toMatch(/both/i);
    expect(validateBankDetails({ accountNumber: "12345678" })).toMatch(/both/i);
  });

  it("checks BSB length", () => {
    expect(validateBankDetails({ bsb: "0620", accountNumber: "12345678", accountName: "A" }))
      .toMatch(/6 digits/);
  });

  it("accepts a BSB written with a dash, as people actually type it", () => {
    expect(validateBankDetails({ bsb: "062-000", accountNumber: "12345678", accountName: "Acme" })).toBeNull();
  });

  it("checks account-number length at both ends", () => {
    expect(validateBankDetails({ bsb: "062000", accountNumber: "1234", accountName: "A" })).toMatch(/5 and 10/);
    expect(validateBankDetails({ bsb: "062000", accountNumber: "12345678901", accountName: "A" })).toMatch(/5 and 10/);
  });

  it("requires the account name, so it can be checked before debiting", () => {
    expect(validateBankDetails({ bsb: "062000", accountNumber: "12345678" })).toMatch(/account name/i);
  });
});

describe("formatting and masking", () => {
  it("formats a BSB the way it's written on forms", () => {
    expect(formatBsb("062000")).toBe("062-000");
    expect(formatBsb("062-000")).toBe("062-000");
    expect(formatBsb("62")).toBe("62"); // incomplete: leave it alone
  });

  it("strips everything that isn't a digit", () => {
    expect(digitsOnly(" 062-000 ")).toBe("062000");
    expect(digitsOnly(null)).toBe("");
  });

  it("shows only three digits", () => {
    // Not four: an account number can be six digits, and four of six gives
    // away most of it.
    expect(accountLast3("12345678")).toBe("678");
    expect(accountLast3("123456")).toBe("456");
    expect(accountLast3("12")).toBeNull();
    expect(maskedAccount("678")).toBe("•••• 678");
    expect(maskedAccount(null)).toBe("—");
  });
});
