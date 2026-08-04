import { describe, it, expect } from "vitest";
import { digitsOf, matchKey, samePhone, formatAuPhone, toE164 } from "@/lib/telephony/phone";
import { userCallToEvent, groupCallToEvent, assertSafeBaseUrl } from "@/lib/telephony/api";
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

describe("real VoIPcloud API payloads", () => {
  // Verbatim from the account's own API documentation page.
  const userOutboundAnswered = {
    unique_call_id: "160455961758", type: "user_outbound_answered",
    caller_id: "61300000000", caller_name: "XYZ", dest_number: "44123456789",
    user_name: "John Smith", user_number: "1010",
    call_start_at: "2019-10-01T15:31:15.000Z", connected_at: "2019-10-01T15:31:29.000Z",
    call_duration: 28, conversation_duration: 14,
  };
  const userInboundMissed = {
    unique_call_id: "160455961918", type: "user_inbound_missed",
    caller_id: "61300000000", caller_name: "XYZ", dest_number: "1002",
    user_name: "Kevin Smith", user_number: "1005",
    call_start_at: "2019-06-18T14:58:39.000Z", connected_at: null,
    call_duration: 5, conversation_duration: 0,
  };

  it("classifies the API's own type strings", () => {
    // Regression: an earlier classifier keyed off the word "call" and returned
    // stage:null for user_inbound_missed — silently losing every missed call.
    expect(classify(userInboundMissed.type)).toEqual({ direction: "inbound", stage: "missed" });
    expect(classify(userOutboundAnswered.type)).toEqual({ direction: "outbound", stage: "answered" });
  });

  it("maps an API row onto the webhook's event shape", () => {
    const e = userCallToEvent(userOutboundAnswered);
    expect(e.unique_call_id).toBe("160455961758");
    expect(e.caller_id).toBe("61300000000");
    expect(e.connected_at).toBe("2019-10-01T15:31:29.000Z");
    // conversation_duration (talk time) is the meaningful one, not call_duration.
    expect(e.duration).toBe(14);
  });

  it("treats a null connected_at as never answered", () => {
    expect(userCallToEvent(userInboundMissed).connected_at).toBeUndefined();
    expect(userCallToEvent(userOutboundAnswered).connected_at).toBeTruthy();
  });

  it("normalises queue rows, which use `callerid` and a separate status", () => {
    const abandoned = groupCallToEvent({
      unique_call_id: null, queue_name: "Sales queue", callerid: "61300000000",
      caller_name: null, dest_number: "44123456789", user_name: "John", user_number: null,
      call_start_at: "2019-09-12T17:57:42.000Z", connected_at: null,
      call_duration: 21, conversation_duration: 0, status: "abandoned",
    }, "queue");
    expect(abandoned.caller_id).toBe("61300000000");     // callerid → caller_id
    expect(classify(abandoned.type).stage).toBe("missed"); // abandoned = missed
    expect(abandoned.component_name).toBe("Sales queue");

    const answered = groupCallToEvent({
      unique_call_id: "1", queue_name: "Support queue", callerid: "61300000000",
      caller_name: "XYZ", dest_number: "1005", user_name: "John", user_number: "1010",
      call_start_at: "2020-11-12T00:36:43.000Z", connected_at: "2020-11-12T00:36:51.000Z",
      call_duration: 24, conversation_duration: 13, status: "answered",
    }, "queue");
    expect(classify(answered.type).stage).toBe("answered");
  });

  it("matches the API's caller_id format against stored numbers", () => {
    // The API returns 61300000000 (no +). A customer saved as 1300 000 000
    // must still match.
    expect(samePhone("61300000000", "1300 000 000")).toBe(true);
  });
});

describe("E.164 for click-to-call", () => {
  it("converts local AU formats", () => {
    expect(toE164("0412 345 678")).toBe("+61412345678");
    expect(toE164("(02) 9876 5432")).toBe("+61298765432");
  });

  it("passes through numbers that already carry a country code", () => {
    expect(toE164("+61412345678")).toBe("+61412345678");
    expect(toE164("61412345678")).toBe("+61412345678");
    expect(toE164("+44 20 7946 0000")).toBe("+442079460000");
  });

  it("refuses anything that isn't dialable", () => {
    expect(toE164("101")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("per-business endpoint (multi-tenant SaaS)", () => {
  it("accepts a reseller's own branded portal", () => {
    // VoIPcloud is white-label — the host can't be hardcoded.
    expect(assertSafeBaseUrl("https://au.voipcloud.online")).toBe("https://au.voipcloud.online");
    expect(assertSafeBaseUrl("https://pbx.somereseller.com.au/")).toBe("https://pbx.somereseller.com.au");
    expect(assertSafeBaseUrl("  https://uk.voipcloud.online/api  ")).toBe("https://uk.voipcloud.online");
  });

  it("blocks SSRF into our own infrastructure", () => {
    // A tenant-supplied URL that OUR server fetches is an SSRF vector: the
    // cloud metadata endpoint is the classic target.
    expect(() => assertSafeBaseUrl("https://169.254.169.254")).toThrow(/hostname, not an IP/);
    expect(() => assertSafeBaseUrl("https://127.0.0.1")).toThrow(/hostname, not an IP/);
    expect(() => assertSafeBaseUrl("https://10.0.0.5")).toThrow(/hostname, not an IP/);
    expect(() => assertSafeBaseUrl("https://localhost")).toThrow(/reachable/);
    expect(() => assertSafeBaseUrl("https://vault.internal")).toThrow(/reachable/);
  });

  it("requires https on the default port", () => {
    expect(() => assertSafeBaseUrl("http://au.voipcloud.online")).toThrow(/https/);
    expect(() => assertSafeBaseUrl("file:///etc/passwd")).toThrow(/https/);
    expect(() => assertSafeBaseUrl("https://au.voipcloud.online:8080")).toThrow(/default https port/);
  });

  it("rejects nonsense rather than silently defaulting", () => {
    expect(() => assertSafeBaseUrl("not a url")).toThrow(/valid URL/);
  });
});
