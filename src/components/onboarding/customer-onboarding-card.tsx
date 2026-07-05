"use client";

/**
 * Onboarding tab on the customer profile — every form sent to this customer,
 * its status, share/copy-link, a send-form picker, and (for completed ones)
 * the answers inline. Secure answers stay redacted here; full viewer +
 * reveal lives at /onboarding-forms/[id]?response=….
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, Send, Copy, Loader2, Lock, Check, ChevronDown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { sendOnboardingRequest, type OnboardingRequestRow } from "@/lib/actions/onboarding";
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
  activeForms: Pick<OnboardingForm, "id" | "name">[];
}

export function CustomerOnboardingCard({ customerId, requests, responses, activeForms }: Props) {
  const router = useRouter();
  const [pickedForm, setPickedForm] = useState("");
  const [busy, setBusy] = useState(false);
  const responseByRequest = new Map(responses.map((r) => [r.request_id, r]));

  const act = async (formId: string, email: boolean) => {
    setBusy(true);
    try {
      const { url } = await sendOnboardingRequest(formId, customerId, { email });
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(email ? "Sent — link also copied" : "Share link copied");
      setPickedForm("");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {/* Send picker */}
      {activeForms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={pickedForm} onValueChange={setPickedForm}>
            <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Choose a form to send…" /></SelectTrigger>
            <SelectContent>
              {activeForms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!pickedForm || busy} onClick={() => act(pickedForm, true)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Send email
          </Button>
          <Button size="sm" variant="outline" disabled={!pickedForm || busy} onClick={() => act(pickedForm, false)}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
          </Button>
        </div>
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
                    {resp && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                        <Link href={`/onboarding-forms/${req.form_id}?response=${req.id}`}>Full view</Link>
                      </Button>
                    )}
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
