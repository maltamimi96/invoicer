import { createClient } from "@/lib/supabase/client";
import type { SignedUpload } from "@/lib/uploads";

/**
 * Browser half of the direct-to-storage upload (see src/lib/uploads.ts for why
 * the bytes must not go through a server action).
 *
 * The signed token authorises exactly the one path the server minted, so this
 * needs no storage RLS policy of its own and can't write anywhere else.
 */
export async function putSignedUpload(
  bucket: string, upload: SignedUpload, file: File,
): Promise<void> {
  const { error } = await createClient().storage
    .from(bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || undefined,
    });
  if (error) throw error;
}
