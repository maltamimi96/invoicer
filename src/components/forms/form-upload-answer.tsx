"use client";

/**
 * An uploaded file on a public-form submission, as something you can actually
 * open.
 *
 * The bucket is private, and getFormUploadUrl — which mints the signed URL —
 * had exactly one reference in the whole repo: its own definition. The
 * Submissions tab rendered uploads as the dead string "📎 filename.jpg", so
 * "upload a photo of the damage", the highest-value question a trades business
 * can ask, produced a file only reachable by hand-crafting a signed URL.
 *
 * Images resolve a thumbnail on mount; everything else stays a click-to-open
 * button, so a submission full of attachments doesn't fire a signed-URL request
 * per row on render.
 */

import { useEffect, useState } from "react";
import { Loader2, Paperclip, ImageIcon } from "@/components/ui/icons";
import { getFormUploadUrl } from "@/lib/actions/forms";

export interface UploadAnswer {
  path: string;
  name?: string | null;
  type?: string | null;
}

const isImage = (u: UploadAnswer) =>
  (u.type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(u.name ?? "");

export function FormUploadAnswer({ upload }: { upload: UploadAnswer }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = isImage(upload);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    getFormUploadUrl(upload.path)
      .then((u) => { if (alive) { if (u) setUrl(u); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [image, upload.path]);

  const open = async () => {
    if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    setBusy(true);
    try {
      const u = await getFormUploadUrl(upload.path);
      if (u) { setUrl(u); window.open(u, "_blank", "noopener,noreferrer"); }
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const label = upload.name || "Attachment";

  if (failed) {
    return <span className="text-sm text-muted-foreground">{label} — unavailable</span>;
  }

  if (image) {
    return (
      <button
        type="button" onClick={open}
        className="group mt-1 block overflow-hidden rounded-lg border border-border bg-muted/40"
        title={`Open ${label}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url} alt={label} loading="lazy" decoding="async"
            className="h-28 w-28 object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <span className="flex h-28 w-28 items-center justify-center text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button" onClick={open} disabled={busy}
      className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
      <span className="break-all">{label}</span>
    </button>
  );
}
