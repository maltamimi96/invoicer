// The full render config for a document template. A superset of the legacy
// `PdfSettings`, so any existing businesses.pdf_settings maps cleanly onto it
// (see resolveTemplateConfig). The PDF renderers read ONLY from a resolved
// TemplateConfig — no more hardcoded palette/branches beyond the base skeleton.

import type { PdfSettings } from "@/types/database";

export type TemplateBase = "classic" | "minimal" | "modern";
export type FontKey = "helvetica" | "inter" | "roboto" | "lora" | "merriweather" | "spacemono";
export type LogoPosition = "left" | "center" | "right";
export type FieldPlacement = "header" | "meta" | "footer";

/** A labelled key/value line printed on the document. Values may contain
 *  {{placeholders}} resolved at render time (see resolvePlaceholders). */
export interface CustomField {
  id: string;
  label: string;
  value: string;
  placement: FieldPlacement;
}

/** A line-item table column. Built-in keys map to LineItem fields; `visible`
 *  and `label` (and order in the array) are user-editable. */
export type ColumnKey = "description" | "quantity" | "unit_price" | "tax" | "total";
export interface TemplateColumn {
  key: ColumnKey;
  label: string;
  visible: boolean;
}

export interface TemplateConfig {
  base: TemplateBase;

  // Palette
  primary_color: string;
  secondary_color: string;
  text_color: string;
  heading_color: string;
  muted_color: string;
  table_header_bg: string;
  table_header_text: string;

  // Background / letterhead
  background_color: string;
  background_image_url: string | null;
  background_image_opacity: number;   // 0..1
  watermark_text: string | null;
  watermark_opacity: number;          // 0..1

  // Typography
  font_family: FontKey;
  font_scale: number;                 // 0.9..1.2

  // Logo
  show_logo: boolean;
  logo_size: number;
  logo_position: LogoPosition;

  // Header / footer chrome
  header_text: string | null;
  footer_text: string | null;
  show_footer: boolean;

  // Labels
  document_title: string;             // "INVOICE" | "TAX INVOICE" | "QUOTE"
  label_tax: string;
  label_bank: string;
  label_account_name: string;
  label_account_number: string;
  label_bsb: string;
  section_title_billto: string;
  section_title_items: string;
  section_title_notes: string;
  section_title_terms: string;
  section_title_payment: string;

  // Section visibility
  show_notes: boolean;
  show_terms: boolean;
  show_payment_details: boolean;
  show_signature: boolean;            // quote acceptance page

  // Custom key/value fields + line-item columns
  custom_fields: CustomField[];
  columns: TemplateColumn[];
}

export const DEFAULT_COLUMNS: TemplateColumn[] = [
  { key: "description", label: "Description", visible: true },
  { key: "quantity",    label: "Qty",         visible: true },
  { key: "unit_price",  label: "Price",       visible: true },
  { key: "tax",         label: "GST",         visible: true },
  { key: "total",       label: "Total",       visible: true },
];

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  base: "classic",

  primary_color: "#2563eb",
  secondary_color: "#111827",
  text_color: "#0f172a",
  heading_color: "#0f172a",
  muted_color: "#64748b",
  table_header_bg: "#f8fafc",
  table_header_text: "#64748b",

  background_color: "#ffffff",
  background_image_url: null,
  background_image_opacity: 1,
  watermark_text: null,
  watermark_opacity: 0.06,

  font_family: "helvetica",
  font_scale: 1,

  show_logo: true,
  logo_size: 72,
  logo_position: "left",

  header_text: null,
  footer_text: null,
  show_footer: true,

  document_title: "INVOICE",
  label_tax: "GST",
  label_bank: "Bank",
  label_account_name: "Name",
  label_account_number: "Account",
  label_bsb: "BSB",
  section_title_billto: "Bill To",
  section_title_items: "Description",
  section_title_notes: "Notes",
  section_title_terms: "Payment Terms",
  section_title_payment: "Payment Details",

  show_notes: true,
  show_terms: true,
  show_payment_details: true,
  show_signature: true,

  custom_fields: [],
  columns: DEFAULT_COLUMNS,
};

/**
 * Build a full TemplateConfig for a document. Precedence:
 *   template.config (if a template is selected)  →  legacy pdf_settings  →  defaults
 * so a business with no templates yet renders exactly as it does today.
 *
 * `docType` seeds the right default title ("QUOTE" vs "INVOICE") when the
 * template/settings don't specify one.
 */
export function resolveTemplateConfig(opts: {
  templateConfig?: Partial<TemplateConfig> | null;
  pdfSettings?: Partial<PdfSettings> | null;
  docType: "invoice" | "quote";
}): TemplateConfig {
  const { templateConfig, pdfSettings, docType } = opts;

  // Map the handful of overlapping legacy fields onto the new shape.
  const fromLegacy: Partial<TemplateConfig> = pdfSettings
    ? {
        base: docType === "quote"
          ? (pdfSettings.quote_template === "classic" ? "classic" : "modern")
          : (pdfSettings.invoice_template as TemplateBase | undefined),
        primary_color: pdfSettings.primary_color,
        logo_size: pdfSettings.logo_size,
        document_title: docType === "quote" ? "QUOTATION" : pdfSettings.invoice_title,
        label_tax: pdfSettings.label_tax,
        label_bank: pdfSettings.label_bank,
        label_account_name: pdfSettings.label_account_name,
        label_account_number: pdfSettings.label_account_number,
        label_bsb: pdfSettings.label_bsb,
      }
    : {};

  const base: TemplateConfig = {
    ...DEFAULT_TEMPLATE_CONFIG,
    document_title: docType === "quote" ? "QUOTATION" : DEFAULT_TEMPLATE_CONFIG.document_title,
  };

  // Drop undefined so a partial override never clobbers a good default.
  const clean = <T extends object>(o: T): Partial<T> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;

  const merged: TemplateConfig = {
    ...base,
    ...clean(fromLegacy),
    ...(templateConfig ? clean(templateConfig) : {}),
  };

  // Arrays: keep a valid non-empty column set even if a template saved [].
  if (!Array.isArray(merged.columns) || merged.columns.length === 0) merged.columns = DEFAULT_COLUMNS;
  if (!Array.isArray(merged.custom_fields)) merged.custom_fields = [];

  return merged;
}

/** Google Fonts static TTFs (all SIL Open Font License). react-pdf fetches
 *  these at render; Helvetica is a built-in PDF standard font and needs no
 *  registration, so it stays the safe default. */
export const FONT_SOURCES: Record<Exclude<FontKey, "helvetica">, { regular: string; bold: string; family: string }> = {
  inter: {
    family: "Inter",
    regular: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.ttf",
    bold:    "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa25L7.ttf",
  },
  roboto: {
    family: "Roboto",
    regular: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf",
    bold:    "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf",
  },
  lora: {
    family: "Lora",
    regular: "https://fonts.gstatic.com/s/lora/v32/0QI6MX1D_JOuGQbT0gvTJPa787weuxJBkqt_.ttf",
    bold:    "https://fonts.gstatic.com/s/lora/v32/0QI6MX1D_JOuGQbT0gvTJPa787wsuxJBkqt_.ttf",
  },
  merriweather: {
    family: "Merriweather",
    regular: "https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZM.ttf",
    bold:    "https://fonts.gstatic.com/s/merriweather/v30/u-4n0qyriQwlOrhSvowK_l52xwNZWMf6hPvhPQ.ttf",
  },
  spacemono: {
    family: "Space Mono",
    regular: "https://fonts.gstatic.com/s/spacemono/v13/i7dPIFZifjKcF5UAWdDRUEZ2RFq7AwU.ttf",
    bold:    "https://fonts.gstatic.com/s/spacemono/v13/i7dMIFZifjKcF5UAWdDRaPpZUFWaHg.ttf",
  },
};

/** Human labels for the font picker. */
export const FONT_LABELS: Record<FontKey, string> = {
  helvetica: "Helvetica (default)",
  inter: "Inter",
  roboto: "Roboto",
  lora: "Lora (serif)",
  merriweather: "Merriweather (serif)",
  spacemono: "Space Mono",
};

let _registered = false;
/**
 * Register the curated font set with @react-pdf. Idempotent; call once before
 * rendering. Registration only DECLARES sources — react-pdf fetches a family
 * lazily when it's actually used, so a template on Helvetica never touches the
 * network. Failures are swallowed: a missing font falls back to Helvetica
 * rather than crashing the whole PDF.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPdfFonts(Font: any): void {
  if (_registered) return;
  _registered = true;
  for (const key of Object.keys(FONT_SOURCES) as Array<keyof typeof FONT_SOURCES>) {
    const f = FONT_SOURCES[key];
    try {
      Font.register({
        family: f.family,
        fonts: [
          { src: f.regular, fontWeight: "normal" },
          { src: f.bold, fontWeight: "bold" },
        ],
      });
    } catch {
      /* ignore — Helvetica fallback */
    }
  }
}

/** Resolve the @react-pdf family names for a config's font. */
export function fontFamilyFor(font: FontKey): { regular: string; bold: string } {
  if (font === "helvetica") return { regular: "Helvetica", bold: "Helvetica-Bold" };
  const f = FONT_SOURCES[font];
  // Bold is the same family with fontWeight:"bold"; react-pdf picks the weight.
  return { regular: f.family, bold: f.family };
}

/** Replace {{placeholders}} in a custom-field value. Unknown tokens are left
 *  as-is so a typo is visible rather than silently blanked. */
export function resolvePlaceholders(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    key in vars ? vars[key] : m,
  );
}
