"use client";

/**
 * Onboarding forms filled in against a LEAD.
 *
 * Qualifying a lead means asking the same questions you'd ask a client, and
 * before this there was nowhere to put the answers until the lead converted.
 *
 * Fill-in only — no "send to them". Portal links are minted against a
 * customer, so a lead has no address to send to. Convert first if you want
 * them to fill it in themselves.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Loader2, PenLine, Eye, ChevronDown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { GradientTile, FadeIn } from "@/components/ui/kirei";
import { StaffOnboardingFill } from "@/components/onboarding/staff-onboarding-fill";
import { saveLeadOnboardingResponse } from "@/lib/actions/onboarding";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { formatDate } from "@/lib/utils";
import type { OnboardingForm, OnboardingResponse, OnboardingField } from "@/types/database";

export interface LeadOnboardingData {
  forms: Pick<OnboardingForm, "id" | "name" | "schema">[];
  responses: OnboardingResponse[];
  allowSecureFill: boolean;
}

export function LeadOnboardingCard({
  leadId, data, delay = 230,
}: { leadId: string; data: LeadOnboardingData; delay?: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const opts = { allowSecure: data.allowSecureFill };
  const fillable = data.forms.filter((f) => staffFillableFields(f.schema, opts).length > 0);

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await saveLeadOnboardingResponse(picked, leadId, answers);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Saved against this lead");
      setPicked(""); setAnswers({});
      router.refresh();
    } finally { setBusy(false); }
  };

  if (fillable.length === 0 && data.responses.length === 0) return null;

  return (
    <FadeIn delay={delay}>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <GradientTile gradient="blue" size={28} radius={8}>
            <ClipboardList className="w-3.5 h-3.5" />
          </GradientTile>
          <p className="text-sm font-semibold">Onboarding</p>
        </div>

        {data.responses.map((r) => (
          <FilledForm key={r.id} response={r} formName={
            data.forms.find((f) => f.id === r.form_id)?.name ?? "Form"
          } />
        ))}

        {fillable.length > 0 && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <StaffOnboardingFill
              forms={fillable.map((f) => ({ id: f.id, name: f.name, schema: f.schema }))}
              value={{ formId: picked, answers }}
              onChange={(next) => { setPicked(next.formId); setAnswers(next.answers); }}
              allowSecure={data.allowSecureFill}
              disabled={busy}
            />
            {picked && (
              <div className="flex justify-end">
                <Button size="sm" disabled={busy} onClick={save}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        : <PenLine className="w-3.5 h-3.5 mr-1.5" />}
                  Save answers
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Filled in by you. To have them fill it in themselves, convert the lead to a customer first &mdash;
              the form link is sent to a customer.
            </p>
          </div>
        )}
      </div>
    </FadeIn>
  );
}

function FilledForm({ response, formName }: { response: OnboardingResponse; formName: string }) {
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
          <Link href={`/onboarding-forms/${response.form_id}?response=${response.request_id}`}>
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
