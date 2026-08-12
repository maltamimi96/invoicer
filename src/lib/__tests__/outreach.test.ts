import { describe, it, expect } from "vitest";
import { mergeFields, withinSendWindow } from "@/lib/outreach/engine";
import { renderOutreachEmail, PREVIEW_PROSPECT, resolveOutreachDesign } from "@/lib/outreach/render";
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

describe("resolveOutreachDesign — campaign branding over business branding", () => {
  const business = {
    email_font: "serif", email_accent: "#111111", email_text_color: "#222222",
    email_width: 700, email_show_logo: true, signature_html: "<b>Biz</b>",
  };

  it("inherits every unset key from the business", () => {
    const d = resolveOutreachDesign(business, { email_accent: "#ff0000" });
    expect(d.email_accent).toBe("#ff0000");
    expect(d.email_font).toBe("serif");
    expect(d.email_width).toBe(700);
    expect(d.signature_html).toBe("<b>Biz</b>");
  });

  it("treats null and blank as inherit, not as a value", () => {
    // A cleared input posts "" — if that overrode, the campaign would render
    // with no accent instead of the business one.
    const d = resolveOutreachDesign(business, {
      email_accent: "", email_font: null, signature_html: "  ",
    });
    expect(d.email_accent).toBe("#111111");
    expect(d.email_font).toBe("serif");
    expect(d.signature_html).toBe("<b>Biz</b>");
  });

  it("falls back to app defaults when the business has nothing set", () => {
    const d = resolveOutreachDesign(null, null);
    expect(d.email_font).toBe("system");
    expect(d.email_width).toBe(560);
    expect(d.email_show_logo).toBe(false);
  });

  it("lets a campaign turn the logo off even though the business has it on", () => {
    // false is a real override — a naive falsy check would drop it and the
    // campaign would keep showing a logo it explicitly hid.
    expect(resolveOutreachDesign(business, { email_show_logo: false }).email_show_logo).toBe(false);
  });

  it("ignores keys that aren't part of the design", () => {
    const d = resolveOutreachDesign(business, { status: "running", id: "x" } as never);
    expect(d).not.toHaveProperty("status");
    expect(d).not.toHaveProperty("id");
  });
});

describe("renderOutreachEmail", () => {
  const base = {
    businessName: "Crown Services",
    unsubUrl: "https://kireihq.com/unsubscribe/u_abc",
  };

  it("prefers the campaign logo over the business logo", () => {
    const html = renderOutreachEmail({
      ...base, body: "Hi", businessLogoUrl: "https://biz/logo.png",
      design: { email_show_logo: true, logo_url: "https://campaign/mark.png" },
    });
    expect(html).toContain("https://campaign/mark.png");
    expect(html).not.toContain("https://biz/logo.png");
  });

  it("drops a logo URL that isn't a plain http(s) link", () => {
    // The campaign logo is typed in by a user and lands in an img src, so a
    // javascript:/data: payload must never survive into a sent email.
    for (const bad of ["javascript:alert(1)", "data:text/html;base64,PHN2Zz4=", "/relative.png"]) {
      const html = renderOutreachEmail({
        ...base, body: "Hi", design: { email_show_logo: true, logo_url: bad },
      });
      expect(html).not.toContain("<img");
    }
  });

  it("cannot break out of the src attribute", () => {
    const html = renderOutreachEmail({
      ...base, body: "Hi",
      design: { email_show_logo: true, logo_url: 'https://x/a.png" onerror="alert(1)' },
    });
    expect(html).not.toContain("onerror");
  });

  it("fills merge fields and preserves line breaks", () => {
    const html = renderOutreachEmail({ ...base, body: "Hi {{first_name}},\n\nSecond line.", prospect: PREVIEW_PROSPECT });
    expect(html).toContain("Hi Sarah,");
    expect(html).toContain("<br><br>Second line.");
  });

  it("escapes the body AND the merged prospect values", () => {
    const html = renderOutreachEmail({
      ...base,
      body: "Hi {{company}} <b>bold</b>",
      prospect: { name: "X", company: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("always includes the unsubscribe link — it is not optional", () => {
    const html = renderOutreachEmail({ ...base, body: "Hi" });
    expect(html).toContain(base.unsubUrl);
    expect(html.toLowerCase()).toContain("unsubscribe");
  });

  it("applies the design: font, width, accent and text colour", () => {
    const html = renderOutreachEmail({
      ...base, body: "Hi",
      design: { email_font: "serif", email_width: 700, email_accent: "#ff0000", email_text_color: "#123456", signature_html: "<b>Me</b>" },
    });
    expect(html).toContain("Georgia");
    expect(html).toContain("max-width:700px");
    expect(html).toContain("#123456");
    expect(html).toContain("border-top:2px solid #ff0000");
  });

  it("rejects a non-hex colour rather than injecting it into the style attribute", () => {
    const html = renderOutreachEmail({
      ...base, body: "Hi",
      design: { email_accent: "red;background:url(javascript:alert(1))", signature_html: "<b>Me</b>" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("#1f4f4a"); // fell back to the default
  });

  it("clamps the width to something that still reads as a personal email", () => {
    expect(renderOutreachEmail({ ...base, body: "Hi", design: { email_width: 5000 } })).toContain("max-width:900px");
    expect(renderOutreachEmail({ ...base, body: "Hi", design: { email_width: 10 } })).toContain("max-width:320px");
  });

  it("only shows the logo when asked AND one exists", () => {
    const on = renderOutreachEmail({ ...base, body: "Hi", businessLogoUrl: "https://x/l.png", design: { email_show_logo: true } });
    expect(on).toContain("<img src=\"https://x/l.png\"");
    expect(renderOutreachEmail({ ...base, body: "Hi", businessLogoUrl: "https://x/l.png" })).not.toContain("<img");
    expect(renderOutreachEmail({ ...base, body: "Hi", design: { email_show_logo: true } })).not.toContain("<img");
  });

  it("omits the signature block entirely when there's no signature", () => {
    expect(renderOutreachEmail({ ...base, body: "Hi" })).not.toContain("border-top:2px solid");
  });
});
