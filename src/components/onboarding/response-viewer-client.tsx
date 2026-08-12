"use client";

/**
 * Business-side view of a customer's submitted onboarding answers.
 * Secure fields arrive REDACTED and can be revealed one-at-a-time by an
 * owner/admin (server-enforced). Uploads open via short-lived signed URLs.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Download, Loader2, Lock, Check, PenLine, Trash2, Send } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import {
  revealSecureAnswer, getOnboardingUploadUrl, updateOnboardingResponse,
  deleteOnboardingRequest, sendOnboardingRequest,
} from "@/lib/actions/onboarding";
import { ClientFields } from "@/components/customers/client-fields";
import { staffFillableFields, staffOnlyCustomerFields, isStaffFillable } from "@/lib/onboarding/staff-fill";
import { socialProfileUrl } from "@/lib/onboarding/presets";
import { AnswerImageThumb } from "@/components/onboarding/answer-image-thumb";
import { formatDate } from "@/lib/utils";
import type { OnboardingResponse, OnboardingField } from "@/types/database";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

interface Props {
  formId: string;
  formName: string;
  response: OnboardingResponse;
  customerName: string;
  customerId: string;
  /** Credential fields editable here (server has an encryption key). */
  allowSecureFill?: boolean;
}

export function ResponseViewerClient({
  formId, formName, response, customerName, customerId, allowSecureFill = false,
}: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const schema = (response.schema_snapshot ?? []) as OnboardingField[];
  const fields = schema.filter((f) => !["instructions", "heading", "divider"].includes(f.type));
  const opts = { allowSecure: allowSecureFill };
  const editable = staffFillableFields(schema, opts).filter(
    (f) => !["heading", "divider", "instructions"].includes(f.type));
  const needsCustomer = staffOnlyCustomerFields(schema, opts);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    // Secure answers arrive redacted, so they start blank. Blank means "keep
    // what is stored", never "wipe it".
    const seed: Record<string, unknown> = {};
    for (const f of editable) {
      if (f.type === "secure") continue;
      const v = response.answers?.[f.id];
      if (v !== undefined) seed[f.id] = v;
    }
    setDraft(seed);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await updateOnboardingResponse(response.request_id, draft);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Answers updated");
      setEditing(false);
      refresh();
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm("Delete this response and the request behind it? The answers are gone for good \u2014 you can send the form again afterwards.")) return;
    setBusy(true);
    try {
      await deleteOnboardingRequest(response.request_id);
      toast.success("Response deleted");
      router.push(`/customers/${customerId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    } finally { setBusy(false); }
  };

  const sendFresh = async () => {
    setBusy(true);
    try {
      const res = await sendOnboardingRequest(formId, customerId, { email: false });
      if (!res.ok) { toast.error(res.error); return; }
      await navigator.clipboard.writeText(res.url).catch(() => {});
      toast.success("New blank form created \u2014 link copied");
      router.push(`/customers/${customerId}`);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Link href="/onboarding-forms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Onboarding forms
      </Link>

      <PageHeader
        title={`${formName} — response`}
        subtitle={
          <span>
            From <Link href={`/customers/${customerId}`} className="underline hover:text-foreground">{customerName}</Link>
            {response.submitted_at ? ` · submitted ${formatDate(response.submitted_at)}` : " · draft (not submitted yet)"}
          </span>
        }
        actions={
          editing ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
              <Button disabled={busy} onClick={save}>
                {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save answers
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={startEdit}>
                <PenLine className="w-4 h-4 mr-1.5" /> Edit answers
              </Button>
              <Button variant="outline" disabled={busy} onClick={sendFresh}>
                <Send className="w-4 h-4 mr-1.5" /> Send a fresh one
              </Button>
              <Button variant="outline" disabled={busy} onClick={remove}
                className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/onboarding-forms/${formId}`}>Edit form</Link>
              </Button>
            </>
          )
        }
      />

      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-6">
          {editing ? (
            <div className="space-y-5">
              <ClientFields
                fields={editable}
                values={draft}
                disabled={busy}
                onChange={(id, v) => setDraft((prev) => ({ ...prev, [id]: v }))}
              />
              {editable.some((f) => f.type === "secure") && (
                <p className="text-xs text-muted-foreground">
                  Leave a credential blank to keep what&rsquo;s already stored &mdash; the editor can&rsquo;t show it back to you.
                </p>
              )}
              {needsCustomer.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {needsCustomer.map((f) => f.label).join(", ")} can only be provided by the customer through
                  their own link, so {needsCustomer.length === 1 ? "it isn't" : "they aren't"} editable here.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {fields.map((f) => (
                <div key={f.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{f.label}</p>
                  <AnswerValue
                    field={f}
                    value={response.answers?.[f.id]}
                    responseId={response.id}
                    staffFillable={isStaffFillable(f, opts)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnswerValue({
  field: f, value, responseId, staffFillable = true,
}: { field: OnboardingField; value: unknown; responseId: string; staffFillable?: boolean }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    // "Not answered" is only honest if it COULD have been answered here. For an
    // upload, or a credential with no key, say whose it is to provide.
    return staffFillable
      ? <p className="text-sm text-muted-foreground italic">Not answered</p>
      : <p className="text-sm text-muted-foreground italic">Needs the customer &mdash; only they can submit this, through their own link</p>;
  }

  switch (f.type) {
    case "secure":
      return <SecureAnswer responseId={responseId} fieldId={f.id} />;

    case "image": {
      const meta = value as { path?: string; name?: string };
      if (!meta?.path) return <p className="text-sm text-muted-foreground italic">Not answered</p>;
      return <AnswerImageThumb path={meta.path} name={meta.name} size="md" />;
    }
    case "file":
      return <UploadAnswer value={value} />;

    case "multi_select":
    case "checkboxes":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((v) => <Badge key={v} variant="secondary">{v}</Badge>)}
        </div>
      );

    case "opening_hours": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hours = value as Record<string, any>;
      return (
        <div className="text-sm space-y-0.5">
          {DAYS.filter((d) => hours[d]).map((d) => (
            <p key={d}>
              <span className="text-muted-foreground inline-block w-24">{DAY_LABEL[d]}</span>
              {hours[d].closed ? <span className="text-muted-foreground">Closed</span> : `${hours[d].open ?? "?"} – ${hours[d].close ?? "?"}`}
            </p>
          ))}
        </div>
      );
    }

    case "rating":
      return <p className="text-sm">{"★".repeat(Number(value) || 0)}{"☆".repeat(Math.max(0, 5 - (Number(value) || 0)))} ({String(value)}/5)</p>;

    case "consent":
      return value === true
        ? <p className="text-sm inline-flex items-center gap-1 text-emerald-600"><Check className="w-4 h-4" /> Agreed</p>
        : <p className="text-sm text-muted-foreground">Not agreed</p>;

    case "url": {
      const href = String(value).startsWith("http") ? String(value) : `https://${value}`;
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">{String(value)}</a>;
    }

    default: {
      // Social-handle presets (instagram / tiktok / x) become profile links.
      const social = typeof value === "string" ? socialProfileUrl(f.preset, value) : null;
      if (social) {
        return (
          <a href={social} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">
            {String(value)}
          </a>
        );
      }
      return <p className="text-sm whitespace-pre-wrap break-words">{String(value)}</p>;
    }
  }
}

function SecureAnswer({ responseId, fieldId }: { responseId: string; fieldId: string }) {
  const [plain, setPlain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try { setPlain(await revealSecureAnswer(responseId, fieldId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't reveal"); }
    finally { setBusy(false); }
  };

  if (plain !== null) {
    return (
      <div className="flex items-center gap-2">
        <code className="text-sm bg-muted px-2 py-1 rounded break-all">{plain}</code>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setPlain(null)}>
          <EyeOff className="w-3.5 h-3.5 mr-1" /> Hide
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> ••••••••
      </span>
      <Button size="sm" variant="outline" className="h-7" onClick={reveal} disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Eye className="w-3.5 h-3.5 mr-1" /> Reveal</>}
      </Button>
    </div>
  );
}

function UploadAnswer({ value }: { value: unknown }) {
  const [busy, setBusy] = useState(false);
  const meta = value as { path?: string; name?: string; size?: number };
  if (!meta?.path) return <p className="text-sm text-muted-foreground italic">Not answered</p>;

  const open = async () => {
    setBusy(true);
    try {
      const url = await getOnboardingUploadUrl(meta.path!);
      if (url) window.open(url, "_blank"); else toast.error("File unavailable");
    } catch { toast.error("Couldn't open file"); }
    finally { setBusy(false); }
  };

  return (
    <Button size="sm" variant="outline" className="h-8" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
      {meta.name ?? "Open file"}{meta.size ? ` (${(meta.size / 1024 / 1024).toFixed(1)} MB)` : ""}
    </Button>
  );
}
