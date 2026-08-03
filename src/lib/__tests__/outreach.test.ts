import { describe, it, expect } from "vitest";
import { mergeFields, withinSendWindow } from "@/lib/outreach/engine";
import { SEED_SEQUENCES, SEEDS_BY_VERTICAL, unfilledPlaceholders } from "@/lib/outreach/seed-sequences";

describe("mergeFields", () => {
  const p = { name: "Sarah Chen", company: "Harbour Strata", title: "Manager", website: "https://x.com" };

  it("uses the first token of the name for {{first_name}}", () => {
    expect(mergeFields("Hi {{first_name}},", p)).toBe("Hi Sarah,");
  });

  it("falls back to 'there' when there's no name", () => {
    expect(mergeFields("Hi {{first_name}},", { name: null })).toBe("Hi there,");
    expect(mergeFields("Hi {{first_name}},", {})).toBe("Hi there,");
  });

  it("fills company / title / website, and empties unknown values", () => {
    expect(mergeFields("{{company}} · {{title}}", p)).toBe("Harbour Strata · Manager");
    expect(mergeFields("[{{company}}]", { name: "X" })).toBe("[]");
  });

  it("is case- and whitespace-insensitive in the tag", () => {
    expect(mergeFields("{{ First_Name }}", p)).toBe("Sarah");
  });

  it("leaves prospect values unescaped — the engine escapes AFTER merging", () => {
    // Regression guard: escaping the template first would let a company name
    // like this reach the email as live markup.
    const merged = mergeFields("Hi {{company}}", { company: "<script>x</script>" });
    expect(merged).toContain("<script>");
  });
});

describe("withinSendWindow", () => {
  const base = {
    timezone: "Australia/Sydney",
    send_window_start: "08:00",
    send_window_end: "17:00",
    send_days: [1, 2, 3, 4, 5],
  };
  // 2026-08-03 is a Monday. 02:00Z = 12:00 Sydney (AEST, UTC+10).
  const monMidday = new Date("2026-08-03T02:00:00Z");
  const monMidnight = new Date("2026-08-03T14:00:00Z");   // 00:00 Tue Sydney
  const satMidday = new Date("2026-08-08T02:00:00Z");     // Saturday

  it("allows a weekday inside the window", () => {
    expect(withinSendWindow(base, monMidday)).toBe(true);
  });

  it("blocks outside the daily window", () => {
    expect(withinSendWindow(base, monMidnight)).toBe(false);
  });

  it("blocks a day that isn't selected", () => {
    expect(withinSendWindow(base, satMidday)).toBe(false);
  });

  it("respects the business's timezone, not the server's", () => {
    // Same instant is inside Sydney's 08:00-17:00 but outside London's.
    expect(withinSendWindow({ ...base, timezone: "Europe/London" }, monMidday)).toBe(false);
  });

  it("defaults to Mon-Fri 08:00-17:00 when unset", () => {
    expect(withinSendWindow({ timezone: "Australia/Sydney" }, monMidday)).toBe(true);
  });
});

describe("seed sequence library", () => {
  it("ships all 11 verticals", () => {
    expect(SEED_SEQUENCES).toHaveLength(11);
    expect(Object.keys(SEEDS_BY_VERTICAL)).toHaveLength(11);
  });

  it("gives every sequence a 4-step arc with step 1 sending immediately", () => {
    for (const s of SEED_SEQUENCES) {
      expect(s.steps, s.vertical).toHaveLength(4);
      expect(s.steps[0].delay_days, s.vertical).toBe(0);
      expect(s.steps.slice(1).every((st) => st.delay_days > 0), s.vertical).toBe(true);
    }
  });

  it("has a subject and body on every step", () => {
    for (const s of SEED_SEQUENCES) {
      for (const [i, st] of s.steps.entries()) {
        expect(st.subject.trim(), `${s.vertical} step ${i + 1}`).not.toBe("");
        expect(st.body.trim(), `${s.vertical} step ${i + 1}`).not.toBe("");
      }
    }
  });

  it("carries no Crown Roofers identity — seeds must be business-agnostic", () => {
    const all = JSON.stringify(SEED_SEQUENCES).toLowerCase();
    for (const leak of ["crown", "roofer", "altamimi", "0490", "crownroofers.com.au"]) {
      expect(all, `seed leaked "${leak}"`).not.toContain(leak);
    }
  });

  it("contains no HTML — bodies are plain text and get escaped on send", () => {
    for (const s of SEED_SEQUENCES) {
      for (const st of s.steps) {
        expect(st.body, s.vertical).not.toMatch(/<[a-z/][^>]*>/i);
      }
    }
  });

  it("opens every first step with a merge field so it reads personally", () => {
    for (const s of SEED_SEQUENCES) {
      expect(s.steps[0].body, s.vertical).toContain("{{first_name}}");
    }
  });

  it("flags the blanks a business still has to fill in", () => {
    expect(unfilledPlaceholders("call [your number] now")).toEqual(["your number"]);
    expect(unfilledPlaceholders("nothing to fill")).toEqual([]);
    // The strata seed deliberately leaves licence/insurance details blank.
    const strata = SEEDS_BY_VERTICAL.strata.steps[0].body;
    expect(unfilledPlaceholders(strata).length).toBeGreaterThan(0);
  });
});
