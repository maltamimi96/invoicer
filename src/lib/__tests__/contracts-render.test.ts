/**
 * The contract body is authored HTML rendered with dangerouslySetInnerHTML on
 * the public signing page — the one screen where the customer types their legal
 * name and draws a signature that gets POSTed as a data URL. These are the
 * payloads that must not survive to it.
 */
import { describe, it, expect } from "vitest";
import { sanitizeContractHtml, renderContractBodyHtml } from "@/lib/contracts/render";

describe("sanitizeContractHtml", () => {
  it("keeps the formatting a contract is actually made of", () => {
    const html = sanitizeContractHtml(
      "<h2>Scope</h2><p>Works include <strong>re-roofing</strong> and <em>gutters</em>.</p>" +
      "<ul><li>Item one</li><li>Item two</li></ul>" +
      "<table><tr><td colspan=\"2\">Cell</td></tr></table>",
    );
    expect(html).toContain("<h2>Scope</h2>");
    expect(html).toContain("<strong>re-roofing</strong>");
    expect(html).toContain("<li>Item one</li>");
    expect(html).toContain('colspan="2"');
  });

  it("drops script tags and their contents", () => {
    const html = sanitizeContractHtml("<p>Terms</p><script>fetch('//evil')</script>");
    expect(html).toContain("<p>Terms</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("evil");
  });

  it("strips event-handler attributes", () => {
    for (const payload of [
      '<img src="x" onerror="alert(1)">',
      '<div onmouseover="alert(1)">hover</div>',
      '<p onclick="alert(1)">click</p>',
    ]) {
      const html = sanitizeContractHtml(payload);
      expect(html).not.toMatch(/on\w+\s*=/i);
      expect(html).not.toContain("alert(1)");
    }
  });

  it("refuses javascript: and data: URLs on links", () => {
    expect(sanitizeContractHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
    expect(sanitizeContractHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>'))
      .not.toContain("data:text/html");
  });

  it("keeps ordinary links but pins rel so the opener isn't handed over", () => {
    const html = sanitizeContractHtml('<a href="https://example.com">terms</a>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("noopener");
  });

  it("removes iframes, styles and forms", () => {
    const html = sanitizeContractHtml(
      '<iframe src="//evil"></iframe><style>body{display:none}</style>' +
      '<form action="//evil"><input name="card"></form><p>ok</p>',
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain("<p>ok</p>");
  });
});

describe("renderContractBodyHtml", () => {
  it("fills merge fields", () => {
    const html = renderContractBodyHtml("<p>For {{customer_name}} of {{customer_company}}</p>", {
      customer: { name: "Sarah Chen", company: "Harbour Strata" },
    });
    expect(html).toContain("Sarah Chen");
    expect(html).toContain("Harbour Strata");
  });

  it("sanitizes AFTER merging, so a hostile customer name can't inject", () => {
    // Merge values come from customer records, which are themselves
    // user-entered. Sanitizing the template first would leave this to be
    // substituted in afterwards as live markup.
    const html = renderContractBodyHtml("<p>Client: {{customer_name}}</p>", {
      customer: { name: '<img src=x onerror="alert(1)">' },
    });
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("survives an empty body", () => {
    expect(renderContractBodyHtml("", {})).toBe("");
  });
});
