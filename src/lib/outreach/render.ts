/**
 * Outreach email rendering — the SINGLE source of truth for what a step looks
 * like when it lands.
 *
 * The engine used to build this HTML inline, which meant any preview would be
 * a second implementation free to drift from the real thing. Everything now
 * renders through renderOutreachEmail(): the cron, "send due now", and the
 * live preview in the builder all call it, so what you see is what sends.
 *
 * Plain module with no server-only imports — it has to run in the browser for
 * the preview.
 */

/** Escape user copy before it goes into an HTML email. */
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fill {{first_name}} / {{name}} / {{company}} / {{title}} / {{website}}. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeFields(tpl: string, p: any): string {
  const first = String(p?.name ?? "").trim().split(/\s+/)[0] || "there";
  return tpl.replace(/\{\{\s*(first_name|name|company|title|website)\s*\}\}/gi, (_m, k: string) => {
    switch (k.toLowerCase()) {
      case "first_name": return first;
      case "company": return String(p?.company ?? "");
      case "title": return String(p?.title ?? "");
      case "website": return String(p?.website ?? "");
      default: return String(p?.name ?? "there");
    }
  });
}

/** Font stacks offered in the design editor. Email-safe only — no webfonts. */
export const EMAIL_FONTS: Record<string, { label: string; stack: string }> = {
  system: { label: "System", stack: "system-ui,Segoe UI,Helvetica,Arial,sans-serif" },
  sans:   { label: "Arial",  stack: "Arial,Helvetica,sans-serif" },
  serif:  { label: "Georgia", stack: "Georgia,'Times New Roman',serif" },
  mono:   { label: "Mono",   stack: "'SF Mono',Consolas,'Liberation Mono',monospace" },
};

export interface OutreachDesign {
  email_font: string;
  email_accent: string;
  email_text_color: string;
  email_width: number;
  email_show_logo: boolean;
  signature_html: string | null;
}

export const DEFAULT_DESIGN: OutreachDesign = {
  email_font: "system",
  email_accent: "#1f4f4a",
  email_text_color: "#0f172a",
  email_width: 560,
  email_show_logo: false,
  signature_html: null,
};

/** A colour we're willing to interpolate into a style attribute. */
function hex(v: string | null | undefined, fallback: string): string {
  return v && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : fallback;
}

export interface RenderInput {
  /** Raw step body — plain text with {{merge_fields}} and newlines. */
  body: string;
  design?: Partial<OutreachDesign> | null;
  businessName: string;
  businessLogoUrl?: string | null;
  /** Absolute unsubscribe URL. Required on every real send. */
  unsubUrl: string;
  /** Prospect the merge fields are filled from. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prospect?: any;
}

/**
 * Render one step to the exact HTML that gets sent.
 *
 * Order matters: merge FIRST, then escape. Escaping the template first would
 * leave the substituted prospect values (which can come from a CSV import or
 * the crawler) as live markup in the outgoing email.
 */
export function renderOutreachEmail(input: RenderInput): string {
  const d = { ...DEFAULT_DESIGN, ...(input.design ?? {}) };
  const font = (EMAIL_FONTS[d.email_font] ?? EMAIL_FONTS.system).stack;
  const accent = hex(d.email_accent, DEFAULT_DESIGN.email_accent);
  const text = hex(d.email_text_color, DEFAULT_DESIGN.email_text_color);
  const width = Math.min(900, Math.max(320, Number(d.email_width) || DEFAULT_DESIGN.email_width));

  const bodyHtml = esc(mergeFields(input.body, input.prospect ?? {})).replace(/\n/g, "<br>");

  const logo = d.email_show_logo && input.businessLogoUrl
    ? `<img src="${input.businessLogoUrl}" alt="${esc(input.businessName)}" height="36" style="display:block;height:36px;width:auto;margin:0 0 20px;border:0">`
    : "";

  const signature = d.signature_html
    ? `<div style="margin-top:20px;padding-top:14px;border-top:2px solid ${accent}">${d.signature_html}</div>`
    : "";

  return (
    `<div style="font-family:${font};max-width:${width}px;margin:0 auto;color:${text};line-height:1.6;font-size:15px">` +
    logo +
    bodyHtml +
    signature +
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">` +
    `<p style="font-size:11px;color:#94a3b8;margin:0">You received this from ${esc(input.businessName)}. ` +
    `<a href="${input.unsubUrl}" style="color:#94a3b8">Unsubscribe</a>.</p>` +
    `</div>`
  );
}

/** Stand-in prospect for previews, so merge fields resolve to something real. */
export const PREVIEW_PROSPECT = {
  name: "Sarah Chen",
  company: "Harbour Strata Management",
  title: "Portfolio Manager",
  website: "https://harbourstrata.example",
  email: "sarah@harbourstrata.example",
};
