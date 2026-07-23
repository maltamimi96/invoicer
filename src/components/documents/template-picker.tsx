"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocumentTemplates, setDocumentTemplate } from "@/lib/actions/document-templates";

/**
 * Per-document template selector shown on the invoice/quote detail pages.
 * Self-fetches the business's templates; renders nothing until at least one
 * exists, so it stays invisible for businesses that never made a template.
 */
export function TemplatePicker({ docType, docId, currentTemplateId }: {
  docType: "invoice" | "quote";
  docId: string;
  currentTemplateId?: string | null;
}) {
  const router = useRouter();
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  const [val, setVal] = useState(currentTemplateId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDocumentTemplates(docType)
      .then((t) => setOpts(t.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setOpts([]));
  }, [docType]);

  if (!opts || opts.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      Template
      <select
        value={val}
        disabled={saving}
        onChange={async (e) => {
          const v = e.target.value;
          setVal(v);
          setSaving(true);
          try {
            await setDocumentTemplate(docType, docId, v || null);
            router.refresh();
          } finally {
            setSaving(false);
          }
        }}
        className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground max-w-[180px]"
      >
        <option value="">Business default</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
