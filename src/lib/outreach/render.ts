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
  /**
   * Campaign-specific logo. Falls back to the business logo when unset, so a
   * campaign can carry a different mark without touching the business record.
   */
  logo_url: string | null;
}

export const DEFAULT_DESIGN: OutreachDesign = {
  email_font: "system",
  email_accent: "#1f4f4a",
  email_text_color: "#0f172a",
  email_width: 560,
  email_show_logo: false,
  signature_html: null,
  logo_url: null,
};

/** The keys a campaign is allowed to override. */
export const DESIGN_KEYS = Object.keys(DEFAULT_DESIGN) as (keyof OutreachDesign)[];

/**
 * A partial design where null is meaningful: it means "inherit", not "unset to
 * nothing". Stored campaign overrides arrive in this shape straight from JSONB.
 */
export type DesignOverride = { [K in keyof OutreachDesign]?: OutreachDesign[K] | null };

/**
 * Layer a campaign's overrides over the business defaults.
 *
 * Only keys the campaign actually set win. An absent key — and equally a null
 * or an empty string, which is what a cleared input posts — inherits, so
 * editing the business accent still moves every campaign that never opted out.
 * Storing a full copy per campaign would silently freeze each one at whatever
 * the business looked like the day it was created.
 */
export function resolveOutreachDesign(
  business: DesignOverride | null | undefined,
  campaign: DesignOverride | null | undefined,
): OutreachDesign {
  const out = { ...DEFAULT_DESIGN, ...pick(business) };
  return { ...out, ...pick(campaign) };
}

/** Drop keys that mean "inherit" (absent / null / blank) and anything unknown. */
function pick(src: DesignOverride | null | undefined): Partial<OutreachDesign> {
  if (!src || typeof src !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const k of DESIGN_KEYS) {
    const v = (src as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as Partial<OutreachDesign>;
}

/** A colour we're willing to interpolate into a style attribute. */
function hex(v: string | null | undefined, fallback: string): string {
  return v && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : fallback;
}

/**
 * A URL we're willing to put in an img src.
 *
 * The business logo comes from our own storage bucket, but a campaign logo is
 * typed in by a user, so it reaches the same attribute untrusted. Anything but
 * a plain http(s) URL is dropped — that rules out `javascript:` and `data:`
 * payloads — and the value is escaped so a quote can't break out of the
 * attribute and add its own.
 */
function safeUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(s)) return null;
  return esc(s).replace(/"/g, "&quot;");
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

  // The campaign's own logo wins; the business logo is the fallback.
  const logoSrc = safeUrl(d.logo_url) ?? safeUrl(input.businessLogoUrl);
  const logo = d.email_show_logo && logoSrc
    ? `<img src="${logoSrc}" alt="${esc(input.businessName)}" height="36" style="display:block;height:36px;width:auto;margin:0 0 20px;border:0">`
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
