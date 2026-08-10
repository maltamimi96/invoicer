"use client";

import { useState, useTransition } from "react";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Save, Plus, Trash2, Pencil, X, AlertCircle, Check } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  updateQuotingAgentSettings, addKnowledge, updateKnowledge, deleteKnowledge,
  setQuotingAgentEnabled,
  type QuotingAgentSettings, type KnowledgeRow, type KnowledgeKind,
} from "@/lib/actions/quoting-agent";

interface Props {
  settings:  QuotingAgentSettings;
  knowledge: KnowledgeRow[];
  currency:  string;
}

const KIND_LABEL: Record<KnowledgeKind, string> = {
  material:       "Material",
  labour:         "Labour",
  rate:           "Rate",
  margin:         "Margin",
  scope_template: "Scope",
  note:           "Note",
};

export function QuotingAgentSettingsClient({ settings: initial, knowledge: initialKnowledge, currency }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // refresh() after an await runs OUTSIDE the transition, so the
  // spinner stopped while the server was still re-rendering. See
  // components/layout/use-mutation.tsx.
  const { refresh } = useTrackedRefresh();
  const [settings, setSettings]    = useState(initial);
  const [knowledge, setKnowledge]  = useState(initialKnowledge);
  const [adding, setAdding]        = useState(false);
  const [editingId, setEditingId]  = useState<string | null>(null);

  const saveDefaults = () => {
    startTransition(async () => {
      try {
        const next = await updateQuotingAgentSettings({
          industries:               settings.industries,
          default_hourly_rate:      settings.default_hourly_rate,
          default_margin_percent:   settings.default_margin_percent,
          default_tax_rate:         settings.default_tax_rate,
          call_out_fee:             settings.call_out_fee,
          emergency_rate_multiplier: settings.emergency_rate_multiplier,
          estimation_mode:          settings.estimation_mode,
          business_notes:           settings.business_notes,
        });
        setSettings(next);
        toast.success("Saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  };

  const toggleEnabled = (v: boolean) => {
    startTransition(async () => {
      try {
        await setQuotingAgentEnabled(v);
        setSettings({ ...settings, enabled: v });
        toast.success(v ? "Agent enabled" : "Agent disabled");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update");
      }
    });
  };

  const removeRow = (id: string) => {
    if (!confirm("Forget this fact?")) return;
    startTransition(async () => {
      try {
        await deleteKnowledge(id);
        setKnowledge((prev) => prev.filter((r) => r.id !== id));
        toast.success("Forgotten");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete");
      }
    });
  };

  const editRow = (id: string, patch: Partial<KnowledgeRow>) => {
    startTransition(async () => {
      try {
        await updateKnowledge(id, patch);
        setKnowledge((prev) => prev.map((r) => r.id === id ? { ...r, ...patch, confirmed: true } : r));
        setEditingId(null);
        toast.success("Updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update");
      }
    });
  };

  const grouped = knowledge.reduce<Record<KnowledgeKind, KnowledgeRow[]>>((acc, r) => {
    (acc[r.kind] ||= []).push(r);
    return acc;
  }, {} as Record<KnowledgeKind, KnowledgeRow[]>);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Quoting Agent settings"
        subtitle="Teach the agent your pricing. Edit any time."
        actions={
          <Button
            variant={settings.enabled ? "outline" : "default"}
            onClick={() => toggleEnabled(!settings.enabled)}
            disabled={pending}
          >
            {settings.enabled ? "Disable agent" : "Enable agent"}
          </Button>
        }
      />

      {!settings.enabled && (
        <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Agent is disabled</p>
            <p className="text-muted-foreground mt-1">
              Settings + knowledge bank are preserved, but the agent tab is hidden from the sidebar and won&apos;t answer requests.
            </p>
          </div>
        </div>
      )}

      {/* Baseline rates */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Baseline rates
            </h2>
            <p className="text-sm text-muted-foreground mt-1">The agent applies these to every quote unless overridden.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Hourly rate ({currency})</Label>
              <Input value={settings.default_hourly_rate ?? ""} onChange={(e) =>
                setSettings({ ...settings, default_hourly_rate: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Default margin (%)</Label>
              <Input value={settings.default_margin_percent ?? ""} onChange={(e) =>
                setSettings({ ...settings, default_margin_percent: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax rate (%)</Label>
              <Input value={settings.default_tax_rate ?? ""} onChange={(e) =>
                setSettings({ ...settings, default_tax_rate: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Call-out fee ({currency})</Label>
              <Input value={settings.call_out_fee ?? ""} onChange={(e) =>
                setSettings({ ...settings, call_out_fee: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Emergency multiplier (×)</Label>
              <Input value={settings.emergency_rate_multiplier ?? ""} onChange={(e) =>
                setSettings({ ...settings, emergency_rate_multiplier: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Industries</Label>
              <Input
                value={settings.industries.join(", ")}
                placeholder="plumbing, electrical, carpentry"
                onChange={(e) => setSettings({ ...settings, industries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
              <p className="text-xs text-muted-foreground">Comma-separated. Used by the agent to bias its estimates.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Estimation mode</Label>
              <div className="flex gap-2 flex-wrap">
                {(["ai_estimate", "manual", "skip"] as const).map((m) => (
                  <Button
                    key={m}
                    variant={settings.estimation_mode === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettings({ ...settings, estimation_mode: m })}
                  >
                    {m === "ai_estimate" ? "Let it estimate" : m === "manual" ? "Ask me" : "Leave blank"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>House notes</Label>
              <Textarea rows={3} value={settings.business_notes ?? ""} onChange={(e) =>
                setSettings({ ...settings, business_notes: e.target.value })} />
              <p className="text-xs text-muted-foreground">Anything the agent should always remember — house style, deposit terms, suppliers, etc.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveDefaults} disabled={pending}>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge bank */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Knowledge bank · {knowledge.length}</h2>
              <p className="text-sm text-muted-foreground mt-1">Long-term memory the agent reads from when quoting. You can edit, delete, or add facts directly.</p>
            </div>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add fact
            </Button>
          </div>

          {adding && (
            <AddRow
              onCancel={() => setAdding(false)}
              onSave={async (row) => {
                try {
                  const saved = await addKnowledge(row);
                  setKnowledge((prev) => [...prev, saved]);
                  setAdding(false);
                  toast.success("Saved");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn't add");
                }
              }}
            />
          )}

          {knowledge.length === 0 && !adding ? (
            <div className="rounded-xl border-dashed border-2 p-6 text-center text-sm text-muted-foreground bg-muted/30">
              No facts yet. Add one above or start chatting with the agent — it&apos;ll learn from you.
            </div>
          ) : (
            <div className="space-y-4">
              {(Object.keys(grouped) as KnowledgeKind[]).sort().map((kind) => (
                <div key={kind}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {KIND_LABEL[kind]} · {grouped[kind].length}
                  </h3>
                  <div className="rounded-lg border overflow-hidden">
                    {grouped[kind].map((r, idx) => (
                      <div key={r.id} className={`p-3 ${idx > 0 ? "border-t" : ""}`}>
                        {editingId === r.id ? (
                          <EditRow row={r} onCancel={() => setEditingId(null)} onSave={(patch) => editRow(r.id, patch)} />
                        ) : (
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{r.key}</p>
                                {!r.confirmed && (
                                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200">
                                    Unconfirmed estimate
                                  </Badge>
                                )}
                                {r.category && <Badge variant="secondary" className="text-xs">{r.category}</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                <span className="font-mono">{r.value}</span>
                                {r.unit && <span className="text-xs"> {r.unit}</span>}
                                {r.notes && <span className="ml-2 italic">— {r.notes}</span>}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(r.id)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeRow(r.id)} disabled={pending}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddRow({ onSave, onCancel }: {
  onSave: (row: { kind: KnowledgeKind; key: string; value: string; unit?: string; category?: string; source: "user"; confirmed: true }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<KnowledgeKind>("material");
  const [key, setKey]     = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit]   = useState("");
  const [category, setCategory] = useState("");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_120px_90px_140px_auto] gap-2 items-end p-3 rounded-lg border bg-muted/20">
      <div className="space-y-1">
        <Label className="text-xs">Kind</Label>
        <select className="w-full h-9 px-2 rounded-md border bg-background text-sm" value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)}>
          {(Object.keys(KIND_LABEL) as KnowledgeKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Name / key</Label>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="1m copper pipe" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Value</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="18.50" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="per m" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Category</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="plumbing" />
      </div>
      <div className="flex gap-1 items-end h-9">
        <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600" disabled={!key.trim() || !value.trim()}
          onClick={() => onSave({ kind, key, value, unit: unit || undefined, category: category || undefined, source: "user", confirmed: true })}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function EditRow({ row, onSave, onCancel }: {
  row: KnowledgeRow;
  onSave: (patch: Partial<KnowledgeRow>) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(row.value);
  const [unit, setUnit]   = useState(row.unit ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr_auto] gap-2 items-end">
      <div className="space-y-1">
        <Label className="text-xs">{row.key}</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="per m" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-1 items-end h-9">
        <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600"
          onClick={() => onSave({ value, unit: unit || null, notes: notes || null })}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
