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

// NOT exported: a "use server" file may only export async functions, and a
// non-async export breaks EVERY export in the file at runtime (not at build).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Step 1 of 2 — mint a signed URL the BROWSER uploads straight to Supabase
 * Storage with.
 *
 * The bytes must not travel through this server. A Next.js server action body
 * is capped at 1MB by default, and Vercel caps any serverless request body at
 * 4.5MB regardless of that setting — so posting a phone photo (routinely
 * 2–8MB) through an action fails before the handler ever runs, surfacing as
 * the opaque "An unexpected response was received from the server."
 *
 * Only this small token request crosses the server, so the real ceiling is the
 * storage bucket's, not the platform's.
 */
export async function createAttachmentUpload(
  entityType: AttachmentEntityType,
  entityId: string,
  fileName: string,
  sizeBytes: number,
): Promise<{ path: string; token: string }> {
  const { businessId } = await ctx();
  if (!entityType || !entityId) throw new Error("Missing entity");
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("Empty file");
  if (sizeBytes > MAX_ATTACHMENT_BYTES) throw new Error("File must be under 25MB");

  const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${businessId}/${entityType}/${entityId}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("attachments").createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Couldn't start upload");
  return { path: data.path, token: data.token };
}

/** Step 2 of 2 — record the row once the browser has finished uploading. */
export async function finalizeAttachment(
  entityType: AttachmentEntityType,
  entityId: string,
  path: string,
  name: string,
  mimeType: string | null,
  sizeBytes: number,
): Promise<Attachment> {
  const { supabase, user, businessId } = await ctx();

  // The path is minted server-side above, but it round-trips through the
  // client — so re-check it belongs to this business before trusting it.
  if (!path.startsWith(`${businessId}/${entityType}/${entityId}/`)) {
    throw new Error("Invalid upload path");
  }

  const { data, error } = await tbl(supabase, "attachments")
    .insert({
      business_id: businessId,
      entity_type: entityType,
      entity_id: entityId,
      name,
      path,
      mime_type: mimeType || null,
      size_bytes: sizeBytes,
      uploaded_by: user.id,
    })
    .select()
    .single();
  if (error) {
    // Best-effort cleanup so we don't orphan the object if the row insert fails.
    await createAdminClient().storage.from("attachments").remove([path]);
    throw error;
  }
  revalidatePath(`/${entityType === "work_order" ? "work-orders" : entityType + "s"}/${entityId}`);
  return data as Attachment;
}

/** Drop an uploaded object whose row never got written (client-side failure). */
export async function discardAttachmentUpload(path: string): Promise<void> {
  const { businessId } = await ctx();
  if (!path.startsWith(`${businessId}/`)) return;
  await createAdminClient().storage.from("attachments").remove([path]);
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
