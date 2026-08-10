"use client";

/**
 * Onboarding tab on the customer profile — every form sent to this customer,
 * its status, share/copy-link, a send-form picker, and (for completed ones)
 * the answers inline. Secure answers stay redacted here; full viewer +
 * reveal lives at /onboarding-forms/[id]?response=….
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Send, Copy, Loader2, Lock, Check, ChevronDown, Eye, PenLine } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  sendOnboardingRequest, saveStaffOnboardingResponse, type OnboardingRequestRow,
} from "@/lib/actions/onboarding";
import { StaffOnboardingFill } from "@/components/onboarding/staff-onboarding-fill";
import { staffFillableFields } from "@/lib/onboarding/staff-fill";
import { AnswerImageThumb } from "@/components/onboarding/answer-image-thumb";
import { formatDate } from "@/lib/utils";
import type { OnboardingForm, OnboardingResponse, OnboardingField } from "@/types/database";

const STATUS_TONES: Record<string, string> = {
  pending: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  viewed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

interface Props {
  customerId: string;
  requests: OnboardingRequestRow[];
  responses: OnboardingResponse[];
  /** `blocked` explains why a form can't be sent, so the picker can say so
   *  before you try rather than after. `schema` powers filling it in yourself. */
  activeForms: (Pick<OnboardingForm, "id" | "name" | "schema"> & { blocked?: string | null })[];
  /** Credential fields fillable here (server has an encryption key). */
  allowSecureFill?: boolean;
}

export function CustomerOnboardingCard({ customerId, requests, responses, activeForms, allowSecureFill = false }: Props) {
  const blockedForms = activeForms.filter((f) => f.blocked);
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [pickedForm, setPickedForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [fillAnswers, setFillAnswers] = useState<Record<string, unknown>>({});
  const [filling, setFilling] = useState(false);
  const responseByRequest = new Map(responses.map((r) => [r.request_id, r]));
  const picked = activeForms.find((f) => f.id === pickedForm) ?? null;
  // A form of nothing but uploads/credentials can't be staff-filled at all.
  const canFill = Boolean(picked && !picked.blocked && staffFillableFields(picked.schema, { allowSecure: allowSecureFill }).length > 0);

  const saveFill = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await saveStaffOnboardingResponse(picked.id, customerId, fillAnswers);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(
        res.needs_customer > 0
          ? `Saved — ${res.needs_customer} field${res.needs_customer === 1 ? "" : "s"} still need the customer`
          : "Saved against this customer",
      );
      setFilling(false); setFillAnswers({}); setPickedForm("");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const act = async (formId: string, email: boolean) => {
    setBusy(true);
    try {
      const res = await sendOnboardingRequest(formId, customerId, { email });
      // Expected failures come back as data — a thrown message would be masked
      // by Next in production and the user would see nothing useful.
      if (!res.ok) { toast.error(res.error); return; }
      await navigator.clipboard.writeText(res.url).catch(() => {});
      toast.success(email ? "Sent — link also copied" : "Share link copied");
      setPickedForm("");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {/* Send picker */}
      {activeForms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={pickedForm}
            onValueChange={(v) => { setPickedForm(v); setFilling(false); setFillAnswers({}); }}
          >
            <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Choose a form to send…" /></SelectTrigger>
            <SelectContent>
              {activeForms.map((f) => (
                <SelectItem key={f.id} value={f.id} disabled={Boolean(f.blocked)}>
                  {f.name}{f.blocked ? " — can’t be sent" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!pickedForm || busy} onClick={() => act(pickedForm, true)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Send email
          </Button>
          <Button size="sm" variant="outline" disabled={!pickedForm || busy} onClick={() => act(pickedForm, false)}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
          </Button>
          <Button size="sm" variant="ghost" disabled={!canFill || busy} onClick={() => setFilling((v) => !v)}>
            <PenLine className="w-3.5 h-3.5 mr-1.5" /> {filling ? "Cancel" : "Fill in myself"}
          </Button>
        </div>
      )}

      {/* Why a form in the list can't be sent — stated before you try it, not
          after. Nothing computed this until now, so the disabled entries in the
          picker had no explanation anywhere. */}
      {blockedForms.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {blockedForms.map((f) => `“${f.name}” ${f.blocked}`).join(" · ")}.
        </p>
      )}

      {filling && picked && (
        <Card><CardContent className="p-4 space-y-4">
          <p className="text-sm font-medium">{picked.name}</p>
          <StaffOnboardingFill
            forms={[{ id: picked.id, name: picked.name, schema: picked.schema }]}
            value={{ formId: picked.id, answers: fillAnswers }}
            onChange={(next) => setFillAnswers(next.answers)}
            showPicker={false}
            allowSecure={allowSecureFill}
            disabled={busy}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={busy} onClick={saveFill}>
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Save answers
            </Button>
          </div>
        </CardContent></Card>
      )}

      {requests.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          <ClipboardList className="w-7 h-7 mx-auto mb-2 opacity-40" />
          No onboarding forms sent to this customer yet.
        </CardContent></Card>
      ) : (
        requests.map((req) => {
          const resp = responseByRequest.get(req.id);
          return (
            <Card key={req.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{req.onboarding_forms?.name ?? "Form"}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent {formatDate(req.sent_at)}
                      {req.completed_at ? ` · completed ${formatDate(req.completed_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={STATUS_TONES[req.status] ?? ""}>{req.status}</Badge>
                    {req.status !== "completed" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(req.form_id, false)} disabled={busy}>
                        <Copy className="w-3 h-3 mr-1" /> Copy link
                      </Button>
                    )}
                    {/* Always openable — before it's completed this shows the
                        form you sent, after it shows their answers. Previously
                        there was no way to look at a form you'd already sent. */}
                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                      <Link href={resp
                        ? `/onboarding-forms/${req.form_id}?response=${req.id}`
                        : `/onboarding-forms/${req.form_id}?view=1`}>
                        <Eye className="w-3 h-3 mr-1" />{resp ? "View answers" : "View form"}
                      </Link>
                    </Button>
                  </div>
                </div>

                {resp && <InlineAnswers response={resp} />}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function InlineAnswers({ response }: { response: OnboardingResponse }) {
  const [open, setOpen] = useState(true);
  const fields = (response.schema_snapshot ?? []).filter(
    (f) => !["instructions", "heading", "divider"].includes(f.type)
  );
  if (fields.length === 0) return null;

  return (
    <div className="border-t border-border/60 pt-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        Answers{response.draft ? " (draft — not submitted)" : ""}
      </button>
      {open && (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
              <dd className="text-sm break-words"><CompactValue field={f} value={response.answers?.[f.id]} /></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function CompactValue({ field: f, value }: { field: OnboardingField; value: unknown }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground italic">—</span>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  if (f.type === "secure" || v?.secure) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="w-3 h-3" /> hidden</span>;
  if (f.type === "image" && v?.path) return <AnswerImageThumb path={v.path} name={v.name} size="sm" />;
  if (f.type === "file" || f.type === "image") return <span>📎 {v?.name ?? "Uploaded"}</span>;
  if (f.type === "consent") return v === true ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3.5 h-3.5" /> Agreed</span> : <span>No</span>;
  if (f.type === "rating") return <span>{"★".repeat(Number(v) || 0)} ({String(v)}/5)</span>;
  if (Array.isArray(v)) return <span>{v.join(", ")}</span>;
  if (f.type === "opening_hours" && typeof v === "object") {
    const parts = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
      .filter((d) => v[d])
      .map((d) => `${d[0].toUpperCase()}${d.slice(1, 3)} ${v[d].closed ? "closed" : `${v[d].open ?? "?"}–${v[d].close ?? "?"}`}`);
    return <span>{parts.join(" · ") || "—"}</span>;
  }
  return <span>{String(v)}</span>;
}
