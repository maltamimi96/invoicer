"use client";

import { useMemo } from "react";
import { renderOutreachEmail, mergeFields, PREVIEW_PROSPECT, type OutreachDesign } from "@/lib/outreach/render";

/**
 * Live preview of an outreach step, rendered through the SAME function the
 * engine sends with — so this can't drift from reality. Merge fields are
 * filled from a stand-in prospect so the copy reads the way it will land.
 *
 * The rendered HTML is inserted with dangerouslySetInnerHTML, which is safe
 * here for the reason it's safe in the email: renderOutreachEmail escapes the
 * body and the merged values. The only unescaped input is signature_html,
 * which the business owner writes about themselves.
 */
export function EmailPreview({
  subject, body, design, businessName, businessLogoUrl, className,
}: {
  subject: string;
  body: string;
  design: Partial<OutreachDesign> | null;
  businessName: string;
  businessLogoUrl?: string | null;
  className?: string;
}) {
  const html = useMemo(
    () => renderOutreachEmail({
      body,
      design,
      businessName,
      businessLogoUrl,
      // A real send uses the prospect's own token; the preview link is inert.
      unsubUrl: "#unsubscribe-preview",
      prospect: PREVIEW_PROSPECT,
    }),
    [body, design, businessName, businessLogoUrl],
  );

  const renderedSubject = useMemo(
    () => mergeFields(subject || "(no subject)", PREVIEW_PROSPECT),
    [subject],
  );

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-white ${className ?? ""}`}>
      {/* Inbox chrome — the from/subject line is most of the open decision */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="truncate text-[13px] font-semibold text-slate-900">{renderedSubject}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {businessName} · to {PREVIEW_PROSPECT.name} &lt;{PREVIEW_PROSPECT.email}&gt;
        </p>
      </div>
      <div className="max-h-[520px] overflow-y-auto bg-white p-5">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        Merge fields filled from a sample prospect ({PREVIEW_PROSPECT.name} at {PREVIEW_PROSPECT.company}).
      </p>
    </div>
  );
}
