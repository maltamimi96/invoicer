// Plain (non-"use server") helper so both the PDF routes and server actions can
// resolve which template config a given invoice/quote should render with.
//
// Precedence: the document's own template_id → the business default template for
// that doc type → legacy businesses.pdf_settings → built-in defaults.

import type { PdfSettings } from "@/types/database";
import type { TemplateConfig } from "./template-config";
import { resolveTemplateConfig } from "./template-config";

export async function resolveDocumentConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: {
    businessId: string;
    docType: "invoice" | "quote";
    templateId?: string | null;
    pdfSettings?: Partial<PdfSettings> | null;
  },
): Promise<TemplateConfig> {
  const { businessId, docType, templateId, pdfSettings } = opts;
  let templateConfig: Record<string, unknown> | null = null;

  if (templateId) {
    const { data } = await sb
      .from("document_templates")
      .select("config")
      .eq("id", templateId)
      .eq("business_id", businessId)
      .maybeSingle();
    templateConfig = data?.config ?? null;
  }

  if (!templateConfig) {
    // Business default: a template flagged is_default whose doc_type covers this
    // document ('both' matches either). Newest wins if somehow more than one.
    const { data } = await sb
      .from("document_templates")
      .select("config, updated_at")
      .eq("business_id", businessId)
      .eq("is_default", true)
      .in("doc_type", [docType, "both"])
      .order("updated_at", { ascending: false })
      .limit(1);
    templateConfig = data?.[0]?.config ?? null;
  }

  return resolveTemplateConfig({
    templateConfig: templateConfig as Partial<TemplateConfig> | null,
    pdfSettings,
    docType,
  });
}
