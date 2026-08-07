"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileStack } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createWorkOrderTemplate, updateWorkOrderTemplate, deleteWorkOrderTemplate,
} from "@/lib/actions/work-order-templates";
import type { WorkOrderTemplate } from "@/types/database";
import { useVocab, lower } from "@/components/layout/vocab-provider";

export function WorkOrderTemplatesClient({ initial }: { initial: WorkOrderTemplate[] }) {
  const v = useVocab("/work-orders", "Work Orders");
  const [templates, setTemplates] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={`${v.singular} templates`} subtitle={`Predefined starting points for new ${lower(v.plural)}. Pick one from the New ${v.singular} form to prefill the common fields.`} />

      <Card className="p-5 space-y-4">
        <div className="font-semibold flex items-center gap-1.5"><FileStack className="size-4" /> Templates</div>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${selectedId === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
              {t.name}
            </button>
          ))}
          {templates.length === 0 && <span className="text-sm text-muted-foreground">No templates yet — create one below.</span>}
        </div>
        <div className="flex gap-2 items-end border-t pt-4">
          <div className="flex-1"><Label className="text-xs">New template name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Inspection" /></div>
          <Button disabled={pending || !newName.trim()} onClick={() => start(async () => {
            try { const row = await createWorkOrderTemplate({ name: newName }); setTemplates((arr) => [...arr, row]); setSelectedId(row.id); setNewName(""); toast.success("Template created"); }
            catch (e) { toast.error((e as Error).message); }
          })}><Plus className="size-4 mr-1" /> Add</Button>
        </div>
      </Card>

      {selected && (
        <TemplateEditor key={selected.id} template={selected}
          onChange={(t) => setTemplates((arr) => arr.map((x) => x.id === t.id ? t : x))}
          onDelete={() => start(async () => {
            await deleteWorkOrderTemplate(selected.id);
            setTemplates((arr) => arr.filter((x) => x.id !== selected.id));
            setSelectedId(templates.find((x) => x.id !== selected.id)?.id ?? null);
            toast.success("Template deleted");
          })} />
      )}
    </div>
  );
}

function TemplateEditor({ template, onChange, onDelete }: {
  template: WorkOrderTemplate;
  onChange: (t: WorkOrderTemplate) => void;
  onDelete: () => void;
}) {
  const [t, setT] = useState(template);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const field = <K extends keyof WorkOrderTemplate>(k: K, v: WorkOrderTemplate[K]) => { setT((x) => ({ ...x, [k]: v })); setDirty(true); };

  const save = () => start(async () => {
    try {
      await updateWorkOrderTemplate(t.id, {
        name: t.name, title: t.title, description: t.description, scope_of_work: t.scope_of_work,
        worker_notes: t.worker_notes, reported_issue: t.reported_issue,
        default_duration_minutes: t.default_duration_minutes,
      });
      setDirty(false); onChange(t); toast.success("Template saved");
    } catch (e) { toast.error((e as Error).message); }
  });

  return (
    <Card className="p-5 space-y-4 border-primary/40">
      <div className="flex items-center gap-3">
        <Input value={t.name} onChange={(e) => field("name", e.target.value)} className="flex-1 font-semibold" placeholder="Template name (e.g. Inspection)" />
        <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Default title">
          <Input value={t.title ?? ""} onChange={(e) => field("title", e.target.value || null)} placeholder="Roof inspection — {{address}}" />
        </Field>
        <Field label="Default duration (minutes)">
          <Input type="number" value={t.default_duration_minutes ?? ""} onChange={(e) => field("default_duration_minutes", e.target.value ? Math.max(0, parseInt(e.target.value)) : null)} placeholder="60" />
        </Field>
      </div>

      <Field label="Description">
        <Textarea value={t.description ?? ""} onChange={(e) => field("description", e.target.value || null)} />
      </Field>
      <Field label="Scope of work">
        <Textarea value={t.scope_of_work ?? ""} onChange={(e) => field("scope_of_work", e.target.value || null)} />
      </Field>
      <Field label="Reported issue (initial brief)">
        <Textarea value={t.reported_issue ?? ""} onChange={(e) => field("reported_issue", e.target.value || null)} />
      </Field>
      <Field label="Worker notes (instructions / checklist)">
        <Textarea value={t.worker_notes ?? ""} onChange={(e) => field("worker_notes", e.target.value || null)} />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : dirty ? "Save template" : "Saved"}</Button>
        {dirty && <span className="text-xs text-muted-foreground">You have unsaved changes</span>}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
