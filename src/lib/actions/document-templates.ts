"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getActiveBizId } from "@/lib/active-business";
import type { DocumentTemplate } from "@/types/database";
import type { TemplateConfig } from "@/lib/documents/template-config";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/documents/template-config";
import { presetByKey } from "@/lib/documents/presets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

type DocType = "invoice" | "quote" | "both";

/** doc_types whose default a new default of `docType` should clear. */
function overlapping(docType: DocType): DocType[] {
  if (docType === "both") return ["invoice", "quote", "both"];
  return [docType, "both"];
}

export async function getDocumentTemplates(docType?: "invoice" | "quote"): Promise<DocumentTemplate[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  let query = tbl(supabase, "document_templates")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (docType) query = query.in("doc_type", [docType, "both"]);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentTemplate[];
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "document_templates")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DocumentTemplate | null;
}

export async function createDocumentTemplate(input: {
  name: string;
  doc_type: DocType;
  config?: Partial<TemplateConfig>;
  from_preset?: string | null;
  make_default?: boolean;
}): Promise<DocumentTemplate> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const name = input.name?.trim();
  if (!name) throw new Error("Template name is required.");

  const preset = input.from_preset ? presetByKey(input.from_preset) : undefined;
  const config: TemplateConfig = {
    ...DEFAULT_TEMPLATE_CONFIG,
    ...(preset?.config ?? {}),
    ...(input.config ?? {}),
  };

  const { data, error } = await tbl(supabase, "document_templates")
    .insert({
      business_id: businessId,
      name,
      doc_type: input.doc_type,
      config,
      source: preset ? "preset" : "user",
      preset_key: preset?.key ?? null,
      is_default: false,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.make_default) await setDefaultDocumentTemplate(data.id);

  revalidatePath("/settings/document-templates");
  return data as DocumentTemplate;
}

export async function updateDocumentTemplate(
  id: string,
  patch: { name?: string; doc_type?: DocType; config?: Partial<TemplateConfig> },
): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error("Template name cannot be empty.");
    fields.name = n;
  }
  if (patch.doc_type !== undefined) fields.doc_type = patch.doc_type;
  if (patch.config !== undefined) {
    // Merge over the stored config so partial saves don't drop other fields.
    const { data: existing } = await tbl(supabase, "document_templates")
      .select("config").eq("id", id).eq("business_id", businessId).maybeSingle();
    fields.config = { ...(existing?.config ?? {}), ...patch.config };
  }
  if (Object.keys(fields).length === 0) return;

  const { error } = await tbl(supabase, "document_templates")
    .update(fields).eq("id", id).eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/settings/document-templates");
}

export async function setDefaultDocumentTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: row } = await tbl(supabase, "document_templates")
    .select("doc_type").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!row) throw new Error("Template not found.");

  // Clear defaults on every template whose doc_type overlaps this one, then set.
  await tbl(supabase, "document_templates")
    .update({ is_default: false })
    .eq("business_id", businessId)
    .in("doc_type", overlapping(row.doc_type as DocType));

  const { error } = await tbl(supabase, "document_templates")
    .update({ is_default: true }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/settings/document-templates");
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // FK on invoices/quotes is ON DELETE SET NULL — affected docs revert to default.
  const { error } = await tbl(supabase, "document_templates")
    .delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;

  revalidatePath("/settings/document-templates");
}

/** Attach (or clear, with null) a template on a specific invoice or quote. */
export async function setDocumentTemplate(
  docType: "invoice" | "quote",
  docId: string,
  templateId: string | null,
): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const table = docType === "invoice" ? "invoices" : "quotes";
  const { error } = await tbl(supabase, table)
    .update({ template_id: templateId })
    .eq("id", docId)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath(`/${table}/${docId}`);
  revalidatePath(`/${table}`);
}
