// Plain (non-"use server") helpers shared by the dashboard, the portal, and the
// signed-PDF generator. Keep these free of server-action side effects so both
// the cookie-authed app and the token-authed portal can import them.

import sanitizeHtml from "sanitize-html";
import { renderTemplateVars } from "@/lib/emails/templates";

/**
 * What a contract body is allowed to contain once it reaches a browser.
 *
 * The body is authored HTML — by an editor-role member, or by the assistant
 * transcribing lead text it did not write — and it is rendered with
 * dangerouslySetInnerHTML on the public signing page. That is the one screen
 * where the customer types their legal name and draws a signature which is
 * POSTed as a data URL, so script running there is about as bad as it gets.
 *
 * Allowlist, not blocklist: anything not named here is dropped. Formatting and
 * links only — no script, style, iframe, form or event-handler attributes, and
 * no javascript:/data: URLs.
 */
const CONTRACT_HTML: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "div", "span", "blockquote",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "small",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Anything that leaves the page should say where it's going and not hand the
  // opener a window reference.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
  disallowedTagsMode: "discard",
};

/** Strip a contract body down to safe formatting HTML. */
export function sanitizeContractHtml(html: string): string {
  return sanitizeHtml(html ?? "", CONTRACT_HTML);
}

/**
 * Fill merge fields and THEN sanitize — the single funnel both the portal and
 * the dashboard render through.
 *
 * Order matters. Merge values come from customer and business records, which
 * are themselves user-entered; sanitizing the template first would leave a
 * name like `<img onerror=…>` to be substituted in afterwards as live markup.
 */
export function renderContractBodyHtml(html: string, ctx: MergeContext): string {
  return sanitizeContractHtml(fillMergeFields(html, ctx));
}

export interface MergeContext {
  customer?: { name?: string | null; company?: string | null; email?: string | null; address?: string | null } | null;
  business?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  /** Pre-formatted date string; caller supplies it (no Date.now() in shared code paths). */
  date?: string;
}

/** Fill {{merge_field}} tokens in a contract body. */
export function fillMergeFields(html: string, ctx: MergeContext): string {
  const c = ctx.customer ?? {};
  const b = ctx.business ?? {};
  return renderTemplateVars(html ?? "", {
    customer_name: c.name ?? "",
    customer_company: c.company ?? "",
    customer_email: c.email ?? "",
    customer_address: c.address ?? "",
    business_name: b.name ?? "",
    business_email: b.email ?? "",
    business_phone: b.phone ?? "",
    business_address: b.address ?? "",
    date: ctx.date ?? "",
  });
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/** Convert simple contract HTML into an array of plain-text paragraphs for the PDF. */
export function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
  return decoded
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
