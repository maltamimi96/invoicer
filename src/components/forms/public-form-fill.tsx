"use client";

/**
 * Public one-shot form fill (hosted /f/[slug] and embedded /embed/[slug]).
 * No auth, no autosave — validates + submits once. Honeypot for spam.
 */

import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Upload, X, Star } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISPLAY_ONLY_TYPES } from "@/lib/onboarding/answers";
import type { OnboardingField, OnboardingAnswers } from "@/types/database";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

interface Props {
  slug: string;
  /** One-person invite token from ?i= — attaches the answers to that lead. */
  invite?: string;
  fields: OnboardingField[];
  submitText: string;
  thankYouMessage: string | null;
  accent?: string;
}

export function PublicFormFill({ slug, invite, fields, submitText, thankYouMessage, accent }: Props) {
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hp = useRef("");

  const endpoint = `/api/f/${slug}`;
  const visible = useMemo(() => fields.filter((f) => {
    if (!f.show_if?.field_id) return true;
    return String(answers[f.show_if.field_id] ?? "") === f.show_if.equals;
  }), [fields, answers]);

  const setAnswer = (id: string, v: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    setProblems((prev) => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
  };

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      const res = await fetch(`${endpoint}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, _hp: hp.current, invite }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const next: Record<string, string> = {};
        if (Array.isArray(j.missing)) for (const id of j.missing) next[id] = "This field is required";
        if (Array.isArray(j.invalid)) for (const e of j.invalid) if (e?.field_id) next[e.field_id] = e.message || "Invalid";
        if (Object.keys(next).length) setProblems(next);
        setError(j.error || "Couldn't submit — please try again.");
        return;
      }
      if (j.redirect_url) { window.location.href = j.redirect_url; return; }
      setDone(true);
    } catch { setError("Couldn't submit — check your connection."); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <Card className="p-8 text-center space-y-3 border-emerald-500/30 bg-emerald-500/5">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto"><Check className="w-6 h-6" /></div>
        <p className="font-semibold text-lg">Thank you!</p>
        <p className="text-sm text-muted-foreground">{thankYouMessage || "Your submission has been received. We'll be in touch shortly."}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-5">
        {/* Honeypot — visually hidden, off-screen. Bots fill it. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          onChange={(e) => { hp.current = e.target.value; }}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

        {visible.map((f) => (
          <FillField key={f.id} field={f} value={answers[f.id]} problem={problems[f.id]} endpoint={endpoint} onChange={(v) => setAnswer(f.id, v)} />
        ))}
      </Card>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <Button onClick={submit} disabled={submitting} size="lg" className="w-full"
        style={accent ? { backgroundColor: accent } : undefined}>
        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        {submitText || "Submit"}
      </Button>
    </div>
  );
}

function FillField({ field: f, value, problem, endpoint, onChange }: {
  field: OnboardingField; value: unknown; problem?: string; endpoint: string; onChange: (v: unknown) => void;
}) {
  if (f.type === "divider") return <hr className="border-border" />;
  if (f.type === "heading") return <h3 className="text-base font-semibold pt-1">{f.label}</h3>;
  if (f.type === "instructions") return <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{f.label}</p>;
  if (DISPLAY_ONLY_TYPES.has(f.type)) return null;

  return (
    <div className={`space-y-1.5 ${problem ? "rounded-lg ring-1 ring-rose-400 p-2 -m-2" : ""}`}>
      {f.type !== "consent" && <Label className="text-sm">{f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}</Label>}
      {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
      <Control field={f} value={value} endpoint={endpoint} onChange={onChange} />
      {problem && <p className="text-xs text-rose-600">{problem}</p>}
    </div>
  );
}

function Control({ field: f, value, endpoint, onChange }: { field: OnboardingField; value: unknown; endpoint: string; onChange: (v: unknown) => void }) {
  switch (f.type) {
    case "long_text": case "address": return <Textarea rows={f.type === "address" ? 2 : 4} value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "dropdown": case "radio":
      if (f.type === "radio" && (f.options ?? []).length <= 5) {
        return <div className="space-y-1.5">{(f.options ?? []).map((o) => <label key={o} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={value === o} onChange={() => onChange(o)} /> {o}</label>)}</div>;
      }
      return <Select value={(value as string) ?? ""} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger><SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>;
    case "multi_select": case "checkboxes": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return <div className="space-y-1.5">{(f.options ?? []).map((o) => <label key={o} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}</label>)}</div>;
    }
    case "yes_no": return <div className="flex gap-2">{["Yes", "No"].map((o) => <Button key={o} type="button" size="sm" variant={value === o ? "default" : "outline"} onClick={() => onChange(o)}>{o}</Button>)}</div>;
    case "opening_hours": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hours = (value ?? {}) as Record<string, any>;
      const patch = (d: string, p: object) => onChange({ ...hours, [d]: { ...(hours[d] ?? {}), ...p } });
      return <div className="space-y-1.5">{DAYS.map((d) => { const r = hours[d] ?? {}; return (
        <div key={d} className="flex items-center gap-2 text-sm">
          <span className="w-10 text-muted-foreground">{DAY_LABEL[d]}</span>
          <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={!!r.closed} onChange={(e) => patch(d, { closed: e.target.checked })} /> closed</label>
          {!r.closed && <><Input type="time" className="h-8 w-[110px]" value={r.open ?? ""} onChange={(e) => patch(d, { open: e.target.value })} /><span className="text-muted-foreground">–</span><Input type="time" className="h-8 w-[110px]" value={r.close ?? ""} onChange={(e) => patch(d, { close: e.target.value })} /></>}
        </div>); })}</div>;
    }
    case "image": case "file": return <UploadControl field={f} value={value} endpoint={endpoint} onChange={onChange} />;
    case "rating": { const n = typeof value === "number" ? value : 0; return <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" onClick={() => onChange(i)}><Star className={`w-6 h-6 ${i <= n ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"}`} /></button>)}</div>; }
    case "consent": return <label className="flex items-start gap-2 text-sm cursor-pointer"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" /><span>{f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}</span></label>;
    case "date": return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "time": return <Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number": case "currency": return <Input type="number" step={f.type === "currency" ? "0.01" : undefined} value={(value as string) ?? ""} placeholder={f.placeholder ?? (f.type === "currency" ? "0.00" : "")} onChange={(e) => onChange(e.target.value)} />;
    case "email": return <Input type="email" value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "phone": return <Input type="tel" value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "url": return <Input type="url" value={(value as string) ?? ""} placeholder={f.placeholder ?? "https://"} onChange={(e) => onChange(e.target.value)} />;
    default: return <Input value={(value as string) ?? ""} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

function UploadControl({ field: f, value, endpoint, onChange }: { field: OnboardingField; value: unknown; endpoint: string; onChange: (v: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const meta = (typeof value === "object" && value !== null ? value : null) as { path?: string; name?: string } | null;

  const upload = async (file?: File) => {
    if (!file) return; setErr(null); setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("field_id", f.id);
      const res = await fetch(`${endpoint}/upload`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Upload failed"); return; }
      onChange(j);
    } catch { setErr("Upload failed"); } finally { setUploading(false); if (ref.current) ref.current.value = ""; }
  };

  if (meta?.path) {
    if (f.type === "image") {
      const src = `${endpoint}/file?path=${encodeURIComponent(meta.path)}`;
      return (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async" src={src} alt={meta.name ?? ""} className="max-h-40 max-w-full rounded-lg border border-border object-contain bg-muted/30" />
          <button type="button" onClick={() => onChange(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
        </div>
      );
    }
    return <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"><span className="truncate">📎 {meta.name}</span><button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-4 h-4" /></button></div>;
  }

  return (
    <div>
      <input ref={ref} type="file" className="hidden" accept={f.type === "image" ? "image/*" : undefined} onChange={(e) => upload(e.target.files?.[0])} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading} className="w-full border border-dashed border-border rounded-lg p-5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{uploading ? "Uploading…" : f.type === "image" ? "Choose an image" : "Choose a file"}
      </button>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </div>
  );
}
