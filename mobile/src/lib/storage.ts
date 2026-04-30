import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

const BUCKET = "work-order-photos";

/**
 * Upload a local file (file:// URI from expo-image-picker) to Supabase Storage
 * under the user's UID. Returns the public URL ready to store on the work order.
 *
 * The bucket policy (see web migration 010_work_orders.sql) requires the path's
 * first segment to equal auth.uid()::text — otherwise the upload is rejected.
 */
export async function uploadJobPhoto(localUri: string): Promise<{ url: string; path: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Not signed in");

  const ext = localUri.split(".").pop()?.toLowerCase() ?? "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectPath = `${userId}/${fileName}`;

  // Read the file as base64 then convert to ArrayBuffer for Supabase Storage.
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64(base64);

  const contentType =
    ext === "png"  ? "image/png"  :
    ext === "heic" ? "image/heic" :
                     "image/jpeg";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl, path: objectPath };
}

// Tiny base64 decoder — avoids pulling in `Buffer` polyfill.
function decodeBase64(b64: string): Uint8Array {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const len  = b64.length;
  const pad  = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const out  = new Uint8Array(((len * 3) >> 2) - pad);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const enc1 = lookup[b64.charCodeAt(i)];
    const enc2 = lookup[b64.charCodeAt(i + 1)];
    const enc3 = lookup[b64.charCodeAt(i + 2)];
    const enc4 = lookup[b64.charCodeAt(i + 3)];

    out[p++] = (enc1 << 2) | (enc2 >> 4);
    if (p < out.length) out[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (p < out.length) out[p++] = ((enc3 &  3) << 6) | enc4;
  }
  return out;
}
