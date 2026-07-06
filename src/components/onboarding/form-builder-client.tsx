"use client";

/**
 * Onboarding form builder — palette (left) · canvas (middle) · field settings
 * (right). Fields reorder via framer-motion Reorder; everything saves through
 * updateOnboardingForm. Preview mode renders the customer-facing approximation.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Eye, Pencil, GripVertical, Lock,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { updateOnboardingForm } from "@/lib/actions/onboarding";
import { PRESET_LIBRARY, PRESET_GROUPS, fieldFromPreset } from "@/lib/onboarding/presets";
import type { OnboardingForm, OnboardingField, OnboardingFieldType } from "@/types/database";

// ── Field palette definition ─────────────────────────────────────────────────

interface FieldDef {
  type: OnboardingFieldType;
  label: string;
  defaultLabel: string;
  hasOptions?: boolean;
  hasPlaceholder?: boolean;
  displayOnly?: boolean;
}

const PALETTE: { group: string; fields: FieldDef[] }[] = [
  { group: "Text", fields: [
    { type: "short_text", label: "Short text", defaultLabel: "Short answer", hasPlaceholder: true },
    { type: "long_text", label: "Long text", defaultLabel: "Long answer", hasPlaceholder: true },
    { type: "instructions", label: "Instructions", defaultLabel: "Read this first", displayOnly: true },
  ]},
  { group: "Contact", fields: [
    { type: "email", label: "Email", defaultLabel: "Email address", hasPlaceholder: true },
    { type: "phone", label: "Phone", defaultLabel: "Phone number", hasPlaceholder: true },
    { type: "url", label: "Website / URL", defaultLabel: "Website", hasPlaceholder: true },
    { type: "address", label: "Address", defaultLabel: "Address", hasPlaceholder: true },
  ]},
  { group: "Business", fields: [
    { type: "company", label: "Company name", defaultLabel: "Company name", hasPlaceholder: true },
    { type: "abn", label: "ABN / ACN", defaultLabel: "ABN" },
    { type: "opening_hours", label: "Opening hours", defaultLabel: "Opening hours" },
  ]},
  { group: "Choices", fields: [
    { type: "dropdown", label: "Dropdown", defaultLabel: "Pick one", hasOptions: true },
    { type: "radio", label: "Radio group", defaultLabel: "Pick one", hasOptions: true },
    { type: "multi_select", label: "Multi-select", defaultLabel: "Pick any", hasOptions: true },
    { type: "checkboxes", label: "Checkboxes", defaultLabel: "Pick any", hasOptions: true },
    { type: "yes_no", label: "Yes / No", defaultLabel: "Yes or no?" },
  ]},
  { group: "Numbers & dates", fields: [
    { type: "number", label: "Number", defaultLabel: "Number" },
    { type: "currency", label: "Currency", defaultLabel: "Amount" },
    { type: "date", label: "Date", defaultLabel: "Date" },
    { type: "time", label: "Time", defaultLabel: "Time" },
  ]},
  { group: "Uploads", fields: [
    { type: "image", label: "Image upload", defaultLabel: "Upload an image" },
    { type: "file", label: "File upload", defaultLabel: "Upload a file" },
  ]},
  { group: "Special", fields: [
    { type: "secure", label: "Secure credential", defaultLabel: "Password / credential" },
    { type: "rating", label: "Rating (1–5)", defaultLabel: "Rate us" },
    { type: "consent", label: "Consent tick", defaultLabel: "I agree" },
  ]},
  { group: "Layout", fields: [
    { type: "heading", label: "Section heading", defaultLabel: "Section", displayOnly: true },
    { type: "divider", label: "Divider", defaultLabel: "", displayOnly: true },
  ]},
];

const DEF_BY_TYPE: Record<string, FieldDef> = Object.fromEntries(
  PALETTE.flatMap((g) => g.fields).map((f) => [f.type, f]),
);

const CHOICE_TYPES = new Set(["dropdown", "radio", "multi_select", "checkboxes", "yes_no"]);

function newId() { return "f_" + Math.random().toString(36).slice(2, 10); }

// ── Main builder ─────────────────────────────────────────────────────────────

interface Props { form: OnboardingForm; secureAvailable: boolean; startInPreview?: boolean }

export function FormBuilderClient({ form, secureAvailable, startInPreview = false }: Props) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [status, setStatus] = useState(form.status);
  const [fields, setFields] = useState<OnboardingField[]>(form.schema ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(startInPreview);
  const [saving, setSaving] = useState(false);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const dirty = useMemo(() =>
    name !== form.name || description !== (form.description ?? "") || status !== form.status ||
    JSON.stringify(fields) !== JSON.stringify(form.schema ?? []),
  [name, description, status, fields, form]);

  const addField = (def: FieldDef) => {
    if (def.type === "secure" && !secureAvailable) {
      toast.error("Secure fields need ONBOARDING_SECRET_KEY set on the server first.");
      return;
    }
    const f: OnboardingField = {
      id: newId(), type: def.type, label: def.defaultLabel,
      ...(def.hasOptions ? { options: ["Option 1", "Option 2"] } : {}),
    };
    setFields((prev) => [...prev, f]);
    setSelectedId(f.id);
    setPreview(false);
  };

  const patchField = (id: string, patch: Partial<OnboardingField>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const removeField = (id: string) => {
    setFields((prev) => prev
      .filter((f) => f.id !== id)
      // Clear conditions that referenced the removed field
      .map((f) => (f.show_if?.field_id === id ? { ...f, show_if: null } : f)));
    if (selectedId === id) setSelectedId(null);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("The form needs a name");
    setSaving(true);
    try {
      await updateOnboardingForm(form.id, {
        name: name.trim(), description: description.trim() || null, status, schema: fields,
      });
      toast.success("Saved");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  };

  // Choice fields that can drive show_if conditions (must come before the target in the form)
  const conditionSources = (target: OnboardingField) => {
    const idx = fields.findIndex((f) => f.id === target.id);
    return fields.slice(0, idx).filter((f) => CHOICE_TYPES.has(f.type));
  };

  return (
    <div>
      <Link href="/onboarding-forms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Onboarding forms
      </Link>

      {/* Header bar */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
        <div className="min-w-0 flex-1 max-w-lg space-y-1">
          <Input value={name} onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold h-10" placeholder="Form name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            className="h-8 text-sm" placeholder="Description shown to the customer (optional)" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setPreview((v) => !v)}>
            {preview ? <Pencil className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      {preview ? (
        <FormPreview name={name} description={description} fields={fields} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_300px]">
          {/* Palette */}
          <Card className="h-fit lg:sticky lg:top-4">
            <CardContent className="p-3 space-y-3 max-h-[75vh] overflow-y-auto">
              {/* Quick-add presets — ready-made fields with validation baked in */}
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">Ready-made</p>
                <Select value="" onValueChange={(key) => {
                  const p = PRESET_LIBRARY.find((x) => x.key === key);
                  if (!p) return;
                  if (p.type === "secure" && !secureAvailable) {
                    toast.error("Secure fields need ONBOARDING_SECRET_KEY set on the server first.");
                    return;
                  }
                  const f = fieldFromPreset(p, newId());
                  setFields((prev) => [...prev, f]);
                  setSelectedId(f.id);
                  setPreview(false);
                }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add a preset field…" /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {PRESET_GROUPS.map((g) => (
                      <div key={g}>
                        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                        {PRESET_LIBRARY.filter((p) => p.group === g).map((p) => (
                          <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground px-1 mt-1">Presets include the right format checks (ABN checksum, handle rules…)</p>
              </div>

              {PALETTE.map((group) => (
                <div key={group.group}>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">{group.group}</p>
                  <div className="grid gap-1">
                    {group.fields.map((def) => {
                      const lockedSecure = def.type === "secure" && !secureAvailable;
                      return (
                        <button key={def.type} onClick={() => addField(def)}
                          title={lockedSecure ? "Set ONBOARDING_SECRET_KEY to enable secure fields" : undefined}
                          className={`flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors ${lockedSecure ? "opacity-50" : ""}`}>
                          <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="flex-1">{def.label}</span>
                          {def.type === "secure" && <Lock className="w-3 h-3 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Canvas */}
          <div>
            {fields.length === 0 ? (
              <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
                Add fields from the palette on the left — drag to reorder, click to edit.
              </CardContent></Card>
            ) : (
              <Reorder.Group axis="y" values={fields} onReorder={setFields} className="space-y-2">
                {fields.map((f) => (
                  <Reorder.Item key={f.id} value={f}>
                    <div
                      onClick={() => setSelectedId(f.id)}
                      className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedId === f.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words">
                          {f.type === "divider" ? <span className="text-muted-foreground">— divider —</span> : f.label || <span className="text-muted-foreground italic">Untitled</span>}
                          {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                        </p>
                        {f.show_if?.field_id && (
                          <p className="text-[11px] text-muted-foreground">shown conditionally</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{DEF_BY_TYPE[f.type]?.label ?? f.type}</Badge>
                      <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                        className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {/* Field settings */}
          <Card className="h-fit lg:sticky lg:top-4">
            <CardContent className="p-4 space-y-3">
              {!selected ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Select a field to edit its settings</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{DEF_BY_TYPE[selected.type]?.label ?? selected.type}</Badge>
                    {selected.type === "secure" && (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Lock className="w-3 h-3" /> encrypted at rest</span>
                    )}
                  </div>

                  {selected.type !== "divider" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input value={selected.label} onChange={(e) => patchField(selected.id, { label: e.target.value })} />
                    </div>
                  )}

                  {!DEF_BY_TYPE[selected.type]?.displayOnly && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Help text (optional)</Label>
                        <Input value={selected.help_text ?? ""} onChange={(e) => patchField(selected.id, { help_text: e.target.value || undefined })} />
                      </div>
                      {DEF_BY_TYPE[selected.type]?.hasPlaceholder && (
                        <div className="space-y-1">
                          <Label className="text-xs">Placeholder</Label>
                          <Input value={selected.placeholder ?? ""} onChange={(e) => patchField(selected.id, { placeholder: e.target.value || undefined })} />
                        </div>
                      )}
                      {DEF_BY_TYPE[selected.type]?.hasOptions && (
                        <div className="space-y-1">
                          <Label className="text-xs">Options (one per line)</Label>
                          <Textarea rows={4} value={(selected.options ?? []).join("\n")}
                            onChange={(e) => patchField(selected.id, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <Label className="text-xs">Required</Label>
                        <Switch checked={!!selected.required} onCheckedChange={(v) => patchField(selected.id, { required: v })} />
                      </div>

                      {/* Conditional visibility */}
                      {conditionSources(selected).length > 0 && (
                        <div className="space-y-2 border-t pt-3">
                          <Label className="text-xs">Show only when…</Label>
                          <Select
                            value={selected.show_if?.field_id ?? "__always__"}
                            onValueChange={(v) => patchField(selected.id, {
                              show_if: v === "__always__" ? null : { field_id: v, equals: selected.show_if?.equals ?? "" },
                            })}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__always__">Always shown</SelectItem>
                              {conditionSources(selected).map((src) => (
                                <SelectItem key={src.id} value={src.id}>{src.label || src.id}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selected.show_if?.field_id && (() => {
                            const src = fields.find((f) => f.id === selected.show_if!.field_id);
                            const opts = src?.type === "yes_no" ? ["Yes", "No"] : (src?.options ?? []);
                            return (
                              <Select
                                value={selected.show_if.equals || "__pick__"}
                                onValueChange={(v) => patchField(selected.id, { show_if: { field_id: selected.show_if!.field_id, equals: v } })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="equals…" /></SelectTrigger>
                                <SelectContent>
                                  {opts.map((o) => <SelectItem key={o} value={o}>= {o}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Preview (customer-facing approximation, non-interactive) ─────────────────

function FormPreview({ name, description, fields }: { name: string; description: string; fields: OnboardingField[] }) {
  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-xl font-semibold">{name}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {fields.map((f) => <PreviewField key={f.id} field={f} />)}
          <Button disabled className="w-full">Submit</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewField({ field: f }: { field: OnboardingField }) {
  if (f.type === "divider") return <hr className="border-border" />;
  if (f.type === "heading") return <h3 className="text-base font-semibold pt-2">{f.label}</h3>;
  if (f.type === "instructions") return <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3">{f.label}</p>;

  const label = (
    <Label className="text-sm">
      {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
      {f.show_if?.field_id && <span className="ml-2 text-[10px] text-muted-foreground">(conditional)</span>}
    </Label>
  );
  const help = f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>;

  const control = (() => {
    switch (f.type) {
      case "long_text": case "address":
        return <Textarea rows={3} disabled placeholder={f.placeholder} />;
      case "dropdown": case "radio":
        return (
          <Select disabled><SelectTrigger><SelectValue placeholder={f.options?.[0] ?? "Choose…"} /></SelectTrigger><SelectContent /></Select>
        );
      case "multi_select": case "checkboxes":
        return (
          <div className="space-y-1.5">
            {(f.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" disabled /> {o}
              </label>
            ))}
          </div>
        );
      case "yes_no":
        return (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled>Yes</Button>
            <Button size="sm" variant="outline" disabled>No</Button>
          </div>
        );
      case "opening_hours":
        return (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
            Mon–Sun open/close time grid
          </div>
        );
      case "image": case "file":
        return (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
            {f.type === "image" ? "Image upload" : "File upload"}
          </div>
        );
      case "rating":
        return <div className="text-lg tracking-widest text-muted-foreground">☆ ☆ ☆ ☆ ☆</div>;
      case "secure":
        return <Input type="password" disabled placeholder="•••••••• (encrypted)" />;
      case "consent":
        return (
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" disabled className="mt-0.5" /> {f.label}
          </label>
        );
      case "date": return <Input type="date" disabled />;
      case "time": return <Input type="time" disabled />;
      case "number": case "currency": return <Input type="number" disabled placeholder={f.placeholder ?? (f.type === "currency" ? "0.00" : "")} />;
      default:
        return <Input disabled placeholder={f.placeholder} />;
    }
  })();

  return (
    <div className="space-y-1.5">
      {f.type !== "consent" && label}
      {help}
      {control}
    </div>
  );
}
