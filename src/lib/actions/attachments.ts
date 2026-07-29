"use server";

/**
 * Generic file attachments on any record (customers, work orders, invoices,
 * quotes, leads). Private `attachments` bucket; files served via short-lived
 * signed URLs. AI-tool-first: matching MCP tools live in register-tools.ts
 * (scopes attachments:read / attachments:write).
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import type { Attachment, AttachmentEntityType } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

async function ctx() {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function listAttachments(entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "attachments")
    .select("*")
    .eq("business_id", businessId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Attachment[];
}

export async function uploadAttachment(formData: FormData): Promise<Attachment> {
  const { supabase, user, businessId } = await ctx();
  const file = formData.get("file") as File | null;
  const entityType = String(formData.get("entity_type") || "") as AttachmentEntityType;
  const entityId = String(formData.get("entity_id") || "");
  if (!file) throw new Error("No file");
  if (!entityType || !entityId) throw new Error("Missing entity");
  if (file.size > 25 * 1024 * 1024) throw new Error("File must be under 25MB");

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${businessId}/${entityType}/${entityId}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await tbl(supabase, "attachments")
    .insert({
      business_id: businessId,
      entity_type: entityType,
      entity_id: entityId,
      name: file.name,
      path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();
  if (error) {
    // Best-effort cleanup so we don't orphan the object if the row insert fails.
    await admin.storage.from("attachments").remove([path]);
    throw error;
  }
  revalidatePath(`/${entityType === "work_order" ? "work-orders" : entityType + "s"}/${entityId}`);
  return data as Attachment;
}

export async function deleteAttachment(id: string): Promise<void> {
  const { supabase, businessId } = await ctx();
  const { data: row } = await tbl(supabase, "attachments")
    .select("path")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await tbl(supabase, "attachments")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;

  if (row?.path) {
    const admin = createAdminClient();
    await admin.storage.from("attachments").remove([row.path]);
  }
}

/** Short-lived signed URL for viewing/downloading a stored file. */
export async function getAttachmentUrl(path: string): Promise<string | null> {
  await ctx();
  const admin = createAdminClient();
  const { data } = await admin.storage.from("attachments").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
