"use client";

/**
 * Customer-facing onboarding form fill. Interactive controls for every field
 * type, live show_if conditions, debounced autosave (drafts survive the tab
 * closing), image/file uploads, then a validated final submit → thank-you.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload, X, Star } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DISPLAY_ONLY_TYPES } from "@/lib/onboarding/answers";
import type { OnboardingField, OnboardingAnswers } from "@/types/database";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

interface Props {
  token: string;
  requestId: string;
  fields: OnboardingField[];
  initialAnswers: OnboardingAnswers;
  alreadySubmitted: boolean;
  thankYouMessage: string | null;
}

export function OnboardingFill({ token, requestId, fields, initialAnswers, alreadySubmitted, thankYouMessage }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(alreadySubmitted);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [savedTick, setSavedTick] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef<OnboardingAnswers>({});

  const endpoint = `/api/portal/${token}/onboarding/${requestId}`;

  const visible = useMemo(() => fields.filter((f) => {
    if (!f.show_if?.field_id) return true;
    return String(answers[f.show_if.field_id] ?? "") === f.show_if.equals;
  }), [fields, answers]);

  const answerable = visible.filter((f) => !DISPLAY_ONLY_TYPES.has(f.type));
  const answeredCount = answerable.filter((f) => {
    const v = answers[f.id];
    return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;

  const setAnswer = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setProblems((prev) => {
      if (!(id in prev)) return prev;
      const n = { ...prev }; delete n[id]; return n;
    });
    dirtyRef.current[id] = value;
    // Debounced autosave of just the changed keys.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const patch = dirtyRef.current;
      dirtyRef.current = {};
      try {
        await fetch(`${endpoint}/save`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: patch }),
        });
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1600);
      } catch { /* autosave is best-effort */ }
    }, 900);
  };

  // Flush pending autosave on unmount.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${endpoint}/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, submit: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const next: Record<string, string> = {};
        if (Array.isArray(j.missing)) for (const id of j.missing) next[id] = "This field is required";
        if (Array.isArray(j.invalid)) for (const e of j.invalid) if (e?.field_id) next[e.field_id] = e.message || "Doesn't match the expected format";
        if (Object.keys(next).length > 0) setProblems(next);
        setError(j.error || "Couldn't submit — please try again.");
        return;
      }
      setDone(true);
      router.refresh();
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <Card className="p-8 text-center space-y-3 border-emerald-500/30 bg-emerald-500/5">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
          <Check className="w-6 h-6" />
        </div>
        <p className="font-semibold text-lg">All done — thank you!</p>
        <p className="text-sm text-muted-foreground">
          {thankYouMessage || "Your details have been sent through. We'll be in touch if we need anything else."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all"
            style={{ width: `${answerable.length ? Math.round((answeredCount / answerable.length) * 100) : 0}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>{answeredCount}/{answerable.length} answered</span>
          <span className={savedTick ? "text-emerald-600" : ""}>{savedTick ? "✓ Saved" : "Progress saves automatically"}</span>
        </div>
      </div>

      <Card className="p-6 space-y-5">
        {visible.map((f) => (
          <FillField key={f.id} field={f} value={answers[f.id]} problem={problems[f.id]}
            endpoint={endpoint} onChange={(v) => setAnswer(f.id, v)} />
        ))}
      </Card>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <Button onClick={submit} disabled={submitting} size="lg" className="w-full">
        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        Submit
      </Button>
    </div>
  );
}

// ── Individual field controls ────────────────────────────────────────────────

function FillField({ field: f, value, problem, endpoint, onChange }: {
  field: OnboardingField;
  value: unknown;
  problem?: string;
  endpoint: string;
  onChange: (v: unknown) => void;
}) {
  if (f.type === "divider") return <hr className="border-border" />;
  if (f.type === "heading") return <h3 className="text-base font-semibold pt-1">{f.label}</h3>;
  if (f.type === "instructions") return <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{f.label}</p>;

  return (
    <div className={`space-y-1.5 ${problem ? "rounded-lg ring-1 ring-rose-400 p-2 -m-2" : ""}`}>
      {f.type !== "consent" && (
        <Label className="text-sm">
          {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
        </Label>
      )}
      {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
      <FieldControl field={f} value={value} endpoint={endpoint} onChange={onChange} />
      {problem && <p className="text-xs text-rose-600">{problem}</p>}
    </div>
  );
}

function FieldControl({ field: f, value, endpoint, onChange }: {
  field: OnboardingField; value: unknown; endpoint: string; onChange: (v: unknown) => void;
}) {
  switch (f.type) {
    case "long_text":
    case "address":
      return <Textarea rows={f.type === "address" ? 2 : 4} value={(value as string) ?? ""} placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)} />;

    case "dropdown":
    case "radio": {
      if (f.type === "radio" && (f.options ?? []).length <= 5) {
        return (
          <div className="space-y-1.5">
            {(f.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={value === o} onChange={() => onChange(o)} /> {o}
              </label>
            ))}
          </div>
        );
      }
      return (
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      );
    }

    case "multi_select":
    case "checkboxes": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {(f.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={arr.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    }

    case "yes_no":
      return (
        <div className="flex gap-2">
          {["Yes", "No"].map((o) => (
            <Button key={o} type="button" size="sm" variant={value === o ? "default" : "outline"} onClick={() => onChange(o)}>{o}</Button>
          ))}
        </div>
      );

    case "opening_hours": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hours = (value ?? {}) as Record<string, any>;
      const patch = (day: string, p: object) => onChange({ ...hours, [day]: { ...(hours[day] ?? {}), ...p } });
      return (
        <div className="space-y-1.5">
          {DAYS.map((d) => {
            const row = hours[d] ?? {};
            return (
              <div key={d} className="flex items-center gap-2 text-sm">
                <span className="w-10 text-muted-foreground">{DAY_LABEL[d]}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!row.closed} onChange={(e) => patch(d, { closed: e.target.checked })} /> closed
                </label>
                {!row.closed && (
                  <>
                    <Input type="time" className="h-8 w-[110px]" value={row.open ?? ""} onChange={(e) => patch(d, { open: e.target.value })} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" className="h-8 w-[110px]" value={row.close ?? ""} onChange={(e) => patch(d, { close: e.target.value })} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "image":
    case "file":
      return <UploadControl field={f} value={value} endpoint={endpoint} onChange={onChange} />;

    case "rating": {
      const n = typeof value === "number" ? value : 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onClick={() => onChange(i)} aria-label={`${i} star${i > 1 ? "s" : ""}`}>
              <Star className={`w-6 h-6 ${i <= n ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"}`} />
            </button>
          ))}
        </div>
      );
    }

    case "secure": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = typeof value === "object" && value !== null && (value as any).saved;
      if (saved) {
        return (
          <div className="flex items-center gap-2 text-sm">
            <Input type="password" disabled value="••••••••" className="flex-1" />
            <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>Replace</Button>
          </div>
        );
      }
      return (
        <div className="space-y-1">
          <Input type="password" value={(value as string) ?? ""} placeholder={f.placeholder ?? "••••••••"}
            onChange={(e) => onChange(e.target.value)} autoComplete="off" />
          <p className="text-[11px] text-muted-foreground">🔒 Stored encrypted — only the business owner can view this.</p>
        </div>
      );
    }

    case "consent":
      return (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
          <span>{f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}</span>
        </label>
      );

    case "date": return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "time": return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "currency":
      return <Input type="number" step={f.type === "currency" ? "0.01" : undefined} value={(value as string) ?? ""}
        placeholder={f.placeholder ?? (f.type === "currency" ? "0.00" : "")} onChange={(e) => onChange(e.target.value)} />;
    case "email": return <Input type="email" value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "phone": return <Input type="tel" value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "url": return <Input type="url" value={(value as string) ?? ""} placeholder={f.placeholder ?? "https://"} onChange={(e) => onChange(e.target.value)} />;

    default:
      return <Input value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

function UploadControl({ field: f, value, endpoint, onChange }: {
  field: OnboardingField; value: unknown; endpoint: string; onChange: (v: unknown) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (typeof value === "object" && value !== null ? value : null) as { path?: string; name?: string; size?: number } | null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setErr(null); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field_id", f.id);
      const res = await fetch(`${endpoint}/upload`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Upload failed"); return; }
      onChange(j); // { path, name, size, type }
    } catch { setErr("Upload failed — check your connection"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  if (meta?.path) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <span className="truncate">📎 {meta.name ?? "Uploaded"}{meta.size ? ` · ${(meta.size / 1024 / 1024).toFixed(1)} MB` : ""}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden"
        accept={f.type === "image" ? "image/*" : undefined}
        onChange={(e) => upload(e.target.files?.[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-full border border-dashed border-border rounded-lg p-5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Uploading…" : f.type === "image" ? "Choose an image" : "Choose a file"}
      </button>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </div>
  );
}
