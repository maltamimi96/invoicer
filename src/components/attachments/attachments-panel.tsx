"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Download, Trash2, Upload, Loader2, Paperclip } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl,
} from "@/lib/actions/attachments";
import type { Attachment, AttachmentEntityType } from "@/types/database";

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Files panel — upload/list/download/delete documents attached to any record
 * (customer, work order, invoice, quote, lead). Drop it onto a detail page.
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  title = "Files",
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  title?: string;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAttachments(entityType, entityId)
      .then((rows) => { if (!cancelled) setFiles(rows); })
      .catch(() => { if (!cancelled) setFiles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const onPick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("entity_type", entityType);
        fd.set("entity_id", entityId);
        const saved = await uploadAttachment(fd);
        setFiles((prev) => [saved, ...prev]);
      }
      toast.success(list.length > 1 ? `${list.length} files uploaded` : "File uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (a: Attachment) => {
    const url = await getAttachmentUrl(a.path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Couldn't open file");
  };

  const remove = async (a: Attachment) => {
    const before = files;
    setFiles((prev) => prev.filter((f) => f.id !== a.id));
    try {
      await deleteAttachment(a.id);
    } catch {
      toast.error("Couldn't delete");
      setFiles(before);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{title}</p>
          {files.length > 0 && <span className="text-xs text-muted-foreground">({files.length})</span>}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </Button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => onPick(e.target.files)} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet. Upload invoices, receipts, photos or any document.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => {
            const isImage = (f.mime_type ?? "").startsWith("image/");
            return (
              <div key={f.id} className="group flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <button onClick={() => open(f)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium hover:underline">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(f.size_bytes)}
                    {f.size_bytes ? " · " : ""}
                    {new Date(f.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </button>
                <button onClick={() => open(f)} className="text-muted-foreground hover:text-foreground" aria-label="Download">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => remove(f)} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
