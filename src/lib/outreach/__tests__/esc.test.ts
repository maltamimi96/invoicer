import { describe, it, expect } from "vitest";
import { esc } from "../render";

/**
 * `esc` is now a security control in three places — outreach email bodies, the
 * public form-submission notification, and the booking notification — and had
 * no test of its own. Two of those take input from anonymous members of the
 * public and mail the result to the business owner, so a regression here puts
 * live HTML into an inbox that trusts it.
 */
describe("esc", () => {
  it("neutralises a tag", () => {
    expect(esc("<script>alert(1)</script>"))
      .toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  // The realistic attack on a form notification isn't a script tag — mail
  // clients strip those. It's a plausible link in an email the owner trusts.
  it("neutralises a link, which is the attack that actually works in email", () => {
    const out = esc('<a href="https://evil.example">View invoice</a>');
    expect(out).not.toContain("<a ");
    expect(out).toContain("&lt;a href=");
  });

  it("escapes the ampersand FIRST, so escapes aren't double-escaped", () => {
    // If & were escaped after < , "&lt;" would become "&amp;lt;" and render
    // as literal "&lt;" instead of "<". Order is load-bearing.
    expect(esc("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(esc("&")).toBe("&amp;");
    expect(esc("&amp;")).toBe("&amp;amp;");
  });

  it("leaves ordinary copy alone", () => {
    expect(esc("Smith & Sons — roof repair, 3pm")).toBe("Smith &amp; Sons — roof repair, 3pm");
    expect(esc("")).toBe("");
  });

  it("handles every occurrence, not just the first", () => {
    expect(esc("<b><i>x</i></b>")).toBe("&lt;b&gt;&lt;i&gt;x&lt;/i&gt;&lt;/b&gt;");
  });

  /**
   * Documented limitation, asserted so nobody assumes otherwise: esc() does
   * NOT escape quotes. That is fine for text between tags — which is every
   * current call site — and NOT fine inside an attribute value. If you ever
   * interpolate user input into an attribute, this is not the function.
   */
  it("does not escape quotes — text-content only, never attributes", () => {
    expect(esc('say "hi"')).toBe('say "hi"');
  });
});
