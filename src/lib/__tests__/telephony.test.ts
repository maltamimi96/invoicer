import { describe, it, expect } from "vitest";
import { digitsOf, matchKey, samePhone, formatAuPhone } from "@/lib/telephony/phone";
import { classify } from "@/lib/telephony/ingest";

describe("phone matching", () => {
  it("collapses every caller-ID format to the same key", () => {
    // The whole integration rests on this: the PBX and the customer record
    // almost never store a number the same way.
    const forms = ["+61412345678", "0412345678", "61412345678", "0412 345 678", "+61 412 345 678"];
    const keys = new Set(forms.map(matchKey));
    expect(keys.size, `expected one key, got ${[...keys].join(", ")}`).toBe(1);
    expect([...keys][0]).toBe("412345678");
  });

  it("handles landlines with area codes and punctuation", () => {
    expect(matchKey("(02) 9876 5432")).toBe("298765432");
    expect(matchKey("+61 2 9876 5432")).toBe("298765432");
    expect(samePhone("(02) 9876 5432", "0298765432")).toBe(true);
  });

  it("refuses to match on short internal extensions", () => {
    // Matching a 3-digit extension would collide across unrelated records.
    expect(matchKey("101")).toBe("");
    expect(matchKey("2005")).toBe("");
    expect(samePhone("101", "101")).toBe(false);
  });

  it("treats empty / missing numbers as no-match, never as equal", () => {
    expect(matchKey(null)).toBe("");
    expect(matchKey("")).toBe("");
    expect(samePhone(null, null)).toBe(false);
    expect(samePhone("", "")).toBe(false);
    expect(samePhone("0412345678", null)).toBe(false);
  });

  it("does not match two different numbers", () => {
    expect(samePhone("0412345678", "0412345679")).toBe(false);
  });

  it("strips non-digits", () => {
    expect(digitsOf("+61 (02) 9876-5432")).toBe("610298765432");
  });

  it("formats for display", () => {
    expect(formatAuPhone("+61412345678")).toBe("0412 345 678");
    expect(formatAuPhone("0298765432")).toBe("(02) 9876 5432");
    expect(formatAuPhone("garbage")).toBe("garbage");
  });
});

describe("webhook event classification", () => {
  // VoIPcloud documents the 11 triggers in prose but not their exact wire
  // strings, so classify() matches on substrings. These cover the documented
  // names plus plausible casing/spacing variants.
  it("reads direction from the event name, defaulting to inbound", () => {
    expect(classify("User outbound call").direction).toBe("outbound");
    expect(classify("User inbound call").direction).toBe("inbound");
    expect(classify("Voicemail").direction).toBe("inbound");
  });

  it("maps each documented trigger to a stage", () => {
    expect(classify("User inbound call").stage).toBe("ringing");
    expect(classify("User inbound call answered").stage).toBe("answered");
    expect(classify("User inbound call completion").stage).toBe("completed");
    expect(classify("Queue call summary").stage).toBe("completed");
    expect(classify("Ring group call summary").stage).toBe("completed");
    expect(classify("Voicemail").stage).toBe("voicemail");
    expect(classify("Inbound call recording").stage).toBe("recording");
    expect(classify("Outbound call recording").stage).toBe("recording");
  });

  it("is case- and format-insensitive", () => {
    expect(classify("user_outbound_call_answered")).toEqual({ direction: "outbound", stage: "answered" });
    expect(classify("USER INBOUND CALL COMPLETION")).toEqual({ direction: "inbound", stage: "completed" });
  });

  it("prefers the more specific stage when words overlap", () => {
    // "answered" must win over the bare "call" that also appears.
    expect(classify("User inbound call answered").stage).toBe("answered");
    // A recording event must not be read as a completion.
    expect(classify("Inbound call recording").stage).toBe("recording");
  });

  it("returns a null stage for anything unrecognised, without throwing", () => {
    expect(classify("something entirely new").stage).toBeNull();
    expect(classify(undefined).stage).toBeNull();
    expect(classify("").stage).toBeNull();
  });
});
