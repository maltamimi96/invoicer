"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, Loader2, ChevronUp, ChevronDown, AlertCircle } from "@/components/ui/icons";
import { saveSequenceSteps, updateSequence } from "@/lib/actions/outreach";
import { unfilledPlaceholders } from "@/lib/outreach/seed-sequences";
import type { OutreachSequence, OutreachSequenceStep } from "@/types/database";

interface Draft { subject: string; body: string; delay_days: number }

const MERGE_FIELDS = ["first_name", "name", "company", "title", "website"];

/** Day each step lands on, counting from enrolment — delays are cumulative. */
function dayOf(steps: Draft[], i: number): number {
  return steps.slice(0, i + 1).reduce((n, s, idx) => n + (idx === 0 ? 0 : s.delay_days), 0);
}

export function SequenceBuilder({
  sequence, initialSteps,
}: {
  sequence: OutreachSequence;
  initialSteps: OutreachSequenceStep[];
}) {
  const router = useRouter();
  const [name, setName] = useState(sequence.name);
  const [steps, setSteps] = useState<Draft[]>(
    initialSteps.map((s) => ({ subject: s.subject, body: s.body, delay_days: s.delay_days })),
  );
  const [saving, setSaving] = useState(false);

  const placeholders = useMemo(
    () => [...new Set(steps.flatMap((s) => [...unfilledPlaceholders(s.subject), ...unfilledPlaceholders(s.body)]))],
    [steps],
  );

  const update = (i: number, p: Partial<Draft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = async () => {
    if (steps.some((s) => !s.subject.trim() || !s.body.trim())) {
      toast.error("Every step needs a subject and a body");
      return;
    }
    setSaving(true);
    try {
      if (name.trim() && name !== sequence.name) await updateSequence(sequence.id, { name: name.trim() });
      await saveSequenceSteps(sequence.id, steps);
      toast.success("Sequence saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link href="/outreach" className="text-muted-foreground hover:text-foreground" aria-label="Back to outreach">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            Sequence
          </span>
        }
        subtitle={sequence.description ?? "Steps send in order — each delay counts from the step before it."}
        actions={
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save sequence
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-border bg-card p-5">
        <Label htmlFor="seq-name">Name</Label>
        <Input id="seq-name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
        <p className="mt-3 text-xs text-muted-foreground">
          Merge fields: {MERGE_FIELDS.map((f) => <code key={f} className="mr-1.5 rounded bg-muted px-1 py-0.5">{`{{${f}}}`}</code>)}
          — a missing value falls back to &ldquo;there&rdquo; for the name, or an empty string.
        </p>
      </div>

      {placeholders.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold">This template still has blanks to fill in</p>
            <p className="text-sm text-muted-foreground">
              {placeholders.map((p) => `[${p}]`).join(" · ")} — these send literally if you leave them.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="flex items-center gap-2">
                <Label htmlFor={`d-${i}`} className="text-xs">
                  {i === 0 ? "Sends immediately on enrolment" : "Days after previous step"}
                </Label>
                {i > 0 && (
                  <Input
                    id={`d-${i}`} type="number" min={0} className="h-8 w-20"
                    value={s.delay_days}
                    onChange={(e) => update(i, { delay_days: Math.max(0, Number(e.target.value) || 0) })}
                  />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {i === 0 ? "day 0" : `lands on day ${dayOf(steps, i)}`}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))} aria-label="Delete step"
                  className="ml-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor={`s-${i}`}>Subject</Label>
                <Input id={`s-${i}`} value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`b-${i}`}>Body</Label>
                <Textarea id={`b-${i}`} rows={10} value={s.body} onChange={(e) => update(i, { body: e.target.value })}
                  className="font-mono text-[13px]" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Plain text — line breaks are preserved. Your signature and the unsubscribe link are added automatically.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" className="mt-3"
        onClick={() => setSteps((p) => [...p, { subject: "", body: "", delay_days: p.length ? 3 : 0 }])}>
        <Plus className="mr-1.5 h-4 w-4" /> Add step
      </Button>
    </div>
  );
}
