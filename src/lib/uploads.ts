/**
 * Direct-to-storage uploads.
 *
 * Why this exists: posting a file through a server action caps it at 1MB by
 * default, and Vercel caps ANY serverless request body at 4.5MB regardless of
 * that setting. A phone photo is routinely 2-8MB, so those uploads failed
 * before the handler ran — surfacing as the opaque Next.js message "An
 * unexpected response was received from the server." Several call sites had
 * generous-looking guards (10MB, 15MB) that could never actually be reached.
 *
 * The fix is the same everywhere: the server mints a short-lived signed upload
 * URL (a few hundred bytes over the wire), the browser PUTs the bytes straight
 * to Supabase Storage, then a second small call records whatever row is needed.
 * The real ceiling becomes the bucket's, and the file no longer makes the
 * browser -> Vercel -> Supabase round trip.
 *
 * Plain module (NOT "use server") so it can export constants — a "use server"
 * file may only export async functions.
 */
import { createAdminClient } from "@/lib/supabase/admin";

/** Per-domain ceilings. These are now real: nothing truncates below them. */
export const UPLOAD_LIMITS = {
  attachment: 25 * 1024 * 1024,
  receipt: 10 * 1024 * 1024,
  contractPdf: 15 * 1024 * 1024,
  templateAsset: 5 * 1024 * 1024,
} as const;

export interface SignedUpload {
  /** Storage path the browser must upload to (server-chosen, never client-chosen). */
  path: string;
  /** One-shot upload token that authorises exactly that path. */
  token: string;
}

/** Filename extension, stripped to a-z0-9 so it can't escape the path. */
export function safeExt(fileName: string, fallback: string): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

export function assertSize(bytes: number, limit: number, label: string): void {
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error("Empty file");
  if (bytes > limit) throw new Error(`${label} must be under ${Math.round(limit / 1024 / 1024)}MB`);
}

/**
 * Mint a signed upload URL for a server-chosen path.
 *
 * Callers build the path themselves so the business/entity prefix is decided
 * server-side — a client that could name its own path could write anywhere in
 * the bucket.
 */
export async function mintUpload(bucket: string, path: string): Promise<SignedUpload> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Couldn't start upload");
  return { path: data.path, token: data.token };
}

/** Delete an object whose owning row never got written. Best effort. */
export async function discardUpload(bucket: string, path: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).storage.from(bucket).remove([path]);
}
