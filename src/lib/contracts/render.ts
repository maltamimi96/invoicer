// Plain (non-"use server") helpers shared by the dashboard, the portal, and the
// signed-PDF generator. Keep these free of server-action side effects so both
// the cookie-authed app and the token-authed portal can import them.

import { renderTemplateVars } from "@/lib/emails/templates";

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
