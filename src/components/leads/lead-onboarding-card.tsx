"use client";

/**
 * Forms against a LEAD — onboarding forms and custom (Form Builder) forms.
 *
 * Qualifying a lead means asking the same questions you'd ask a client, and
 * before this there was nowhere to put the answers until the lead converted.
 *
 * Two ways to get the answers:
 *
 *   Fill in    — you type them on the lead's behalf.
 *   Send       — they fill it in themselves.
 *
 * Sending used to be impossible here, because a portal link hangs off a
 * customer and a lead has none. It now mints the lead's contact row on the
 * way out, exactly as the Quote and Invoice buttons already do. **They stay a
 * lead** — only a payment makes a client. Answering a questionnaire is not
 * buying something.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Loader2, PenLine, Eye, ChevronDown, Send, Copy, Check } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { GradientTile, FadeIn } from "@/components/ui/kirei";
import { StaffOnboardingFill, type StaffFillForm } from "@/components/onboarding/staff-onboarding-fill";
import { saveLeadOnboardingResponse, sendOnboardingToLead } from "@/lib/actions/onboarding";
import { savePublicFormFill } from "@/lib/actions/public-form-fill";
import { sendFormToLead } from "@/lib/actions/forms";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { formatDate } from "@/lib/utils";
import type { OnboardingForm, OnboardingResponse, OnboardingField } from "@/types/database";

export interface LeadOnboardingData {
  forms: StaffFillForm[];
  responses: OnboardingResponse[];
  allowSecureFill: boolean;
}

export function LeadOnboardingCard({
  leadId, data, delay = 230,
}: { leadId: string; data: LeadOnboardingData; delay?: number }) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [picked, setPicked] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const opts = { allowSecure: data.allowSecureFill };
  // Sendable is the wider set. Anything with fields can be sent; only forms
  // with staff-fillable fields can be typed in on the lead's behalf (uploads
  // and credentials can't be supplied by someone else).
  const sendable = data.forms;
  const canFill = (id: string) => {
    const f = data.forms.find((x) => x.id === id);
    return !!f && staffFillableFields(f.schema, opts).length > 0;
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const form = data.forms.find((f) => f.id === picked);
      const res = form?.kind === "public"
        ? await savePublicFormFill(picked, { kind: "lead", id: leadId }, answers)
        : await saveLeadOnboardingResponse(picked, leadId, answers);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved against this lead");
      setPicked(""); setAnswers({});
      refresh();
    } finally { setBusy(false); }
  };

  /** Email them the form. Works for both form systems — they differ only in
   *  which action mints the link. */
  const send = async () => {
    if (!picked) return;
    setSending(true);
    setSentUrl(null);
    try {
      const form = data.forms.find((f) => f.id === picked);
      const res = form?.kind === "public"
        ? await sendFormToLead(picked, leadId)
        : await sendOnboardingToLead(picked, leadId);

      if (!res.ok) { toast.error(res.error); return; }

      // A lead with no email still gets a usable link — show it rather than
      // reporting a failure over an address we may not need.
      const emailed = "emailed" in res ? res.emailed : true;
      toast.success(emailed ? "Sent — they'll get an email" : "Link ready — no email on file, copy it below");
      setSentUrl(res.url);
      setPicked(""); setAnswers({});
      refresh();
    } finally { setSending(false); }
  };

  if (sendable.length === 0 && data.responses.length === 0) return null;

  return (
    <FadeIn delay={delay}>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <GradientTile gradient="blue" size={28} radius={8}>
            <ClipboardList className="w-3.5 h-3.5" />
          </GradientTile>
          <p className="text-sm font-semibold">Forms</p>
        </div>

        {data.responses.map((r) => (
          <FilledForm
            key={r.id}
            response={r}
            formName={data.forms.find((f) => f.id === r.form_id)?.name ?? "Form"}
            // Two form systems, two places to view an answer. Sending an
            // onboarding id to /forms (or vice versa) 404s.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            kind={(r as any).kind === "public" ? "public" : "onboarding"}
          />
        ))}

        {sendable.length > 0 && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <StaffOnboardingFill
              forms={sendable.map((f) => ({ id: f.id, name: f.name, schema: f.schema }))}
              value={{ formId: picked, answers }}
              onChange={(next) => { setPicked(next.formId); setAnswers(next.answers); }}
              allowSecure={data.allowSecureFill}
              disabled={busy}
            />
            {picked && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy || sending} onClick={send}>
                  {sending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                           : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Send to them
                </Button>
                {canFill(picked) && (
                  <Button size="sm" disabled={busy || sending} onClick={save}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          : <PenLine className="w-3.5 h-3.5 mr-1.5" />}
                    Save answers
                  </Button>
                )}
              </div>
            )}

            {sentUrl && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 p-2">
                <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{sentUrl}</code>
                <Button
                  size="sm" variant="ghost" className="h-7 shrink-0 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(sentUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Onboarding forms and custom forms both appear here.{" "}
              <strong>Save answers</strong> records what you already know;{" "}
              <strong>Send to them</strong> emails a link they fill in themselves.
              Either way they stay a lead until they pay.
            </p>
          </div>
        )}
      </div>
    </FadeIn>
  );
}

function FilledForm({ response, formName, kind = "onboarding" }: {
  response: OnboardingResponse; formName: string; kind?: "onboarding" | "public";
}) {
  const [open, setOpen] = useState(false);
  const fields = (response.schema_snapshot ?? []).filter(
    (f: OnboardingField) => !["heading", "divider", "instructions"].includes(f.type),
  );

  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          {formName}
          <span className="text-xs font-normal text-muted-foreground">
            {response.submitted_at ? formatDate(response.submitted_at) : "draft"}
          </span>
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
          <Link href={kind === "public"
            ? `/forms/${response.form_id}?tab=submissions`
            : `/onboarding-forms/${response.form_id}?response=${response.request_id}`}>
            <Eye className="w-3 h-3 mr-1" /> View
          </Link>
        </Button>
      </div>
      {open && (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {fields.map((f: OnboardingField) => {
            const v = response.answers?.[f.id];
            const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
            return (
              <div key={f.id} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                <dd className="text-sm break-words">
                  {empty
                    ? <span className="italic text-muted-foreground">&mdash;</span>
                    : typeof v === "object"
                      ? <span className="text-muted-foreground">hidden</span>
                      : String(v)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
