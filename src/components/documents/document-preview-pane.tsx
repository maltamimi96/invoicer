"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ChevronDown, ChevronUp } from "@/components/ui/icons";
import { getDocumentTemplates } from "@/lib/actions/document-templates";

/**
 * Live PDF preview + template selector for the invoice/quote editor. Shows the
 * ACTUAL in-progress document (real line items, totals, customer) rendered with
 * the selected template, updating (debounced) as the user edits.
 */
export function DocumentPreviewPane({ docType, templateId, onTemplateChange, draft, customerId }: {
  docType: "invoice" | "quote";
  templateId: string | null;
  onTemplateChange: (id: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: Record<string, any>;
  customerId: string | null;
}) {
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    getDocumentTemplates(docType)
      .then((t) => setTemplates(t.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setTemplates([]));
  }, [docType]);

  const key = useMemo(() => JSON.stringify({ templateId, customerId, draft }), [templateId, customerId, draft]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/pdf/draft-preview", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_type: docType, template_id: templateId, customer_id: customerId, doc: draft }),
        });
        if (cancelled) return;
        if (!res.ok) { setError("Couldn't render preview"); return; }
        const blob = await res.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = next;
        setUrl(next);
      } catch {
        if (!cancelled) setError("Couldn't render preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open]);

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold">Live preview</span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Template
            <select
              value={templateId ?? ""}
              onChange={(e) => onTemplateChange(e.target.value || null)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground max-w-[200px]"
            >
              <option value="">Business default</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="bg-muted/30">
          {error ? (
            <div className="h-[70vh] flex items-center justify-center text-sm text-muted-foreground">{error}</div>
          ) : url ? (
            <iframe title="Document preview" src={url} className="w-full h-[80vh] bg-white" />
          ) : (
            <div className="h-[70vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          )}
        </div>
      )}
    </div>
  );
}
