"use client";

/**
 * Business-side view of a customer's submitted onboarding answers.
 * Secure fields arrive REDACTED and can be revealed one-at-a-time by an
 * owner/admin (server-enforced). Uploads open via short-lived signed URLs.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Download, Loader2, Lock, Check } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { revealSecureAnswer, getOnboardingUploadUrl } from "@/lib/actions/onboarding";
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
}

export function ResponseViewerClient({ formId, formName, response, customerName, customerId }: Props) {
  const fields = (response.schema_snapshot ?? []).filter(
    (f) => !["instructions", "heading", "divider"].includes(f.type)
  );

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
        accent="linear-gradient(180deg, #2dd4bf 0%, #0e7490 100%)"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/onboarding-forms/${formId}`}>Edit form</Link>
          </Button>
        }
      />

      <Card className="max-w-2xl">
        <CardContent className="p-6 divide-y divide-border/60">
          {fields.map((f) => (
            <div key={f.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">{f.label}</p>
              <AnswerValue field={f} value={response.answers?.[f.id]} responseId={response.id} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AnswerValue({ field: f, value, responseId }: { field: OnboardingField; value: unknown; responseId: string }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <p className="text-sm text-muted-foreground italic">Not answered</p>;
  }

  switch (f.type) {
    case "secure":
      return <SecureAnswer responseId={responseId} fieldId={f.id} />;

    case "file":
    case "image":
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

    default:
      return <p className="text-sm whitespace-pre-wrap break-words">{String(value)}</p>;
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
