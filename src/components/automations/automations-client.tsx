"use client";

/**
 * The automations builder: When → If → Then, plus what actually happened.
 *
 * The run history is not decoration. An automation that silently stopped
 * working is the failure mode that matters — you don't notice an email that
 * didn't arrive — so every rule shows its last runs and why they ended.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Zap, Check, X, ChevronDown,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  TRIGGERS, CONDITION_OPS, CONDITION_FIELDS, actionsForTrigger, triggerFor,
  validateAutomation, type AutomationCondition, type AutomationAction,
} from "@/lib/automations/schema";
import {
  saveAutomation, setAutomationEnabled, deleteAutomation,
  type AutomationRow, type AutomationRunRow,
} from "@/lib/actions/automations";
import { formatDate } from "@/lib/utils";

interface Props {
  automations: AutomationRow[];
  runs: AutomationRunRow[];
  forms: Array<{ id: string; name: string }>;
}

const BLANK = {
  id: undefined as string | undefined,
  name: "",
  trigger_event: TRIGGERS[0].event,
  conditions: [] as AutomationCondition[],
  actions: [] as AutomationAction[],
};

export function AutomationsClient({ automations, runs, forms }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft) return;
    const problem = validateAutomation(draft);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    try {
      const res = await saveAutomation(draft);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(draft.id ? "Automation updated" : "Automation created");
      setDraft(null);
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="When something happens, do something about it."
        accent="linear-gradient(180deg, #3a847e 0%, #1f4f4a 100%)"
        actions={
          <Button onClick={() => setDraft({ ...BLANK })}>
            <Plus className="w-4 h-4 mr-1.5" /> New automation
          </Button>
        }
      />

      {automations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Zap className="w-7 h-7 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Nothing automated yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The common one: when a client is added, email them your onboarding form.
          </p>
          <Button className="mt-4" onClick={() => setDraft({ ...BLANK })}>
            <Plus className="w-4 h-4 mr-1.5" /> New automation
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              runs={runs.filter((r) => r.automation_id === a.id)}
              forms={forms}
              onEdit={() => setDraft({
                id: a.id, name: a.name, trigger_event: a.trigger_event,
                conditions: a.conditions ?? [], actions: a.actions ?? [],
              })}
            />
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit automation" : "New automation"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <Builder draft={draft} setDraft={setDraft} forms={forms} busy={busy} onSave={save} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Builder({ draft, setDraft, forms, busy, onSave }: {
  draft: typeof BLANK;
  setDraft: (d: typeof BLANK) => void;
  forms: Array<{ id: string; name: string }>;
  busy: boolean;
  onSave: () => void;
}) {
  const trigger = triggerFor(draft.trigger_event);
  const available = actionsForTrigger(draft.trigger_event);
  const fields = CONDITION_FIELDS[trigger?.entity ?? "customer"] ?? [];

  const set = (patch: Partial<typeof BLANK>) => setDraft({ ...draft, ...patch });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={draft.name}
          placeholder="Welcome pack for new clients"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
        <Select
          value={draft.trigger_event}
          onValueChange={(v) => {
            // Actions are filtered by the trigger's entity, so ones that no
            // longer apply are dropped rather than left to fail at run time.
            const stillValid = draft.actions.filter((a) =>
              actionsForTrigger(v).some((d) => d.type === a.type));
            set({ trigger_event: v, conditions: [], actions: stillValid });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRIGGERS.map((t) => <SelectItem key={t.event} value={t.event}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {trigger && <p className="text-xs text-muted-foreground">{trigger.hint}</p>}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          If <span className="font-normal normal-case">(optional — leave empty to run every time)</span>
        </p>
        {draft.conditions.map((c, i) => {
          const opDef = CONDITION_OPS.find((o) => o.op === c.op);
          return (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <Select value={c.field} onValueChange={(v) => {
                const next = [...draft.conditions]; next[i] = { ...c, field: v }; set({ conditions: next });
              }}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Field" /></SelectTrigger>
                <SelectContent>
                  {fields.map((f) => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={c.op} onValueChange={(v) => {
                const next = [...draft.conditions]; next[i] = { ...c, op: v }; set({ conditions: next });
              }}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPS.map((o) => <SelectItem key={o.op} value={o.op}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {opDef?.needsValue && (
                <Input
                  className="flex-1 min-w-[140px]"
                  value={c.value ?? ""}
                  placeholder="Value"
                  onChange={(e) => {
                    const next = [...draft.conditions]; next[i] = { ...c, value: e.target.value }; set({ conditions: next });
                  }}
                />
              )}
              <button
                aria-label="Remove condition"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => set({ conditions: draft.conditions.filter((_, idx) => idx !== i) })}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        <Button size="sm" variant="outline" onClick={() => set({
          conditions: [...draft.conditions, { field: fields[0]?.field ?? "", op: "eq", value: "" }],
        })}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add condition
        </Button>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Then</p>
        {available.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing can run on this trigger yet.
          </p>
        )}
        {draft.actions.map((a, i) => {
          const def = available.find((d) => d.type === a.type);
          return (
            <div key={i} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{def?.label ?? a.type}</p>
                <button
                  aria-label="Remove action"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => set({ actions: draft.actions.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {def?.needs === "onboarding_form" && (
                <div className="space-y-1.5">
                  <Label>Which form</Label>
                  {forms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No onboarding forms yet — build one first, under Onboarding.
                    </p>
                  ) : (
                    <Select value={a.form_id ?? ""} onValueChange={(v) => {
                      const next = [...draft.actions]; next[i] = { ...a, form_id: v }; set({ actions: next });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Choose a form…" /></SelectTrigger>
                      <SelectContent>
                        {forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {def?.needs === "message" && (
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea
                    rows={3}
                    value={a.message ?? ""}
                    placeholder="Hi {{name}}, thanks for getting in touch — we'll be in contact shortly."
                    onChange={(e) => {
                      const next = [...draft.actions]; next[i] = { ...a, message: e.target.value }; set({ actions: next });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {String(a.message ?? "").length} characters · one segment is 160
                  </p>
                </div>
              )}
              {def && <p className="text-xs text-muted-foreground">{def.hint}</p>}
            </div>
          );
        })}
        {available.map((d) => (
          <Button key={d.type} size="sm" variant="outline"
            onClick={() => set({ actions: [...draft.actions, { type: d.type }] })}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {d.label}
          </Button>
        ))}
      </section>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => setDraft({ ...draft, id: undefined, name: "" })} disabled={busy}>
          Clear
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save automation
        </Button>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
  pending: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  running: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function AutomationCard({ automation, runs, forms, onEdit }: {
  automation: AutomationRow;
  runs: AutomationRunRow[];
  forms: Array<{ id: string; name: string }>;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const trigger = triggerFor(automation.trigger_event);
  const failures = runs.filter((r) => r.status === "failed").length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium break-words">{automation.name}</p>
            {!automation.enabled && <Badge variant="secondary">Off</Badge>}
            {failures > 0 && (
              <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                {failures} failed
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            When {(trigger?.label ?? automation.trigger_event).toLowerCase()}
            {automation.conditions?.length ? `, if ${automation.conditions.length} condition${automation.conditions.length > 1 ? "s" : ""} match` : ""}
            {" → "}
            {(automation.actions ?? []).map((a) => {
              const label = a.type === "send_onboarding_form"
                ? `email ${forms.find((f) => f.id === a.form_id)?.name ?? "a form"}`
                : a.type === "send_sms" ? "send a text"
                : a.type;
              return label;
            }).join(", ") || "nothing yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {automation.run_count > 0
              ? `Ran ${automation.run_count} time${automation.run_count > 1 ? "s" : ""}${automation.last_run_at ? ` · last ${formatDate(automation.last_run_at)}` : ""}`
              : "Hasn't run yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={automation.enabled}
            disabled={busy}
            onCheckedChange={async (v) => {
              setBusy(true);
              try { await setAutomationEnabled(automation.id, v); router.refresh(); }
              finally { setBusy(false); }
            }}
          />
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Delete "${automation.name}"? Its run history goes with it.`)) return;
              setBusy(true);
              try { await deleteAutomation(automation.id); toast.success("Deleted"); router.refresh(); }
              finally { setBusy(false); }
            }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {runs.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <button onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
            Recent runs ({runs.length})
          </button>
          {open && (
            <div className="mt-2 space-y-1.5">
              {runs.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs">
                  <Badge variant="secondary" className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge>
                  <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                  {r.error && <span className="text-destructive break-words">{r.error}</span>}
                  {!r.error && r.status === "done" && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Check className="w-3 h-3" /> sent
                    </span>
                  )}
                  {r.attempt_count > 1 && (
                    <span className="text-muted-foreground">· attempt {r.attempt_count}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shown when the plugin is off — the same shape as the other plugin pages. */
export function AutomationsDisabled() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-xl mx-auto py-12 text-center">
      <Zap className="w-8 h-8 mx-auto mb-3 opacity-50" />
      <h1 className="text-lg font-semibold">Automations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        When a client is added, email them your onboarding form. When a lead comes in, create a task.
        Rules that run themselves, so you stop remembering to.
      </p>
      <Button className="mt-5" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const { setAutomationsEnabled } = await import("@/lib/actions/automations");
          await setAutomationsEnabled(true);
          router.refresh();
        } finally { setBusy(false); }
      }}>
        {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
        Turn on Automations
      </Button>
    </div>
  );
}
