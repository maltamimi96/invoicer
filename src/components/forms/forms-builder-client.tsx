"use client";

/**
 * Public form builder — Build / Settings / Submissions tabs. Reuses the
 * onboarding field model + presets (minus secure fields). Publishes a public
 * page at /f/[slug] and an iframe embed at /embed/[slug].
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTrackedRefresh } from "@/components/layout/use-mutation";
import Link from "next/link";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Eye, Pencil, GripVertical, Copy, ExternalLink, CodeIcon, ListChecks } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { updatePublicForm, deleteFormSubmission, type SubmissionRow } from "@/lib/actions/forms";
import { PRESET_LIBRARY, PRESET_GROUPS, fieldFromPreset } from "@/lib/onboarding/presets";
import { embedSnippet } from "@/lib/forms/embed";
import { FormFieldPreview } from "@/components/forms/form-field-preview";
import { formatDate } from "@/lib/utils";
import type { PublicForm, OnboardingField, OnboardingFieldType, PublicFormSettings } from "@/types/database";

// Field palette — same model as onboarding, minus secure (public form).
const PALETTE: { group: string; fields: { type: OnboardingFieldType; label: string; hasOptions?: boolean; hasPlaceholder?: boolean; displayOnly?: boolean; defaultLabel: string }[] }[] = [
  { group: "Text", fields: [
    { type: "short_text", label: "Short text", defaultLabel: "Short answer", hasPlaceholder: true },
    { type: "long_text", label: "Long text", defaultLabel: "Message", hasPlaceholder: true },
    { type: "instructions", label: "Instructions", defaultLabel: "Read this", displayOnly: true },
  ]},
  { group: "Contact", fields: [
    { type: "email", label: "Email", defaultLabel: "Email", hasPlaceholder: true },
    { type: "phone", label: "Phone", defaultLabel: "Phone", hasPlaceholder: true },
    { type: "url", label: "Website", defaultLabel: "Website", hasPlaceholder: true },
    { type: "address", label: "Address", defaultLabel: "Address", hasPlaceholder: true },
  ]},
  { group: "Choices", fields: [
    { type: "dropdown", label: "Dropdown", defaultLabel: "Pick one", hasOptions: true },
    { type: "radio", label: "Radio", defaultLabel: "Pick one", hasOptions: true },
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
  { group: "Extras", fields: [
    { type: "rating", label: "Rating", defaultLabel: "Rate us" },
    { type: "consent", label: "Consent tick", defaultLabel: "I agree" },
    { type: "heading", label: "Heading", defaultLabel: "Section", displayOnly: true },
    { type: "divider", label: "Divider", defaultLabel: "", displayOnly: true },
  ]},
];
const DEF_BY_TYPE = Object.fromEntries(PALETTE.flatMap((g) => g.fields).map((f) => [f.type, f]));
const newId = () => "f_" + Math.random().toString(36).slice(2, 10);
const CHOICE_TYPES = new Set(["dropdown", "radio", "multi_select", "checkboxes", "yes_no"]);
// Presets safe for public forms (drop secure ones).
const PUBLIC_PRESETS = PRESET_LIBRARY.filter((p) => p.type !== "secure");
const PUBLIC_PRESET_GROUPS = PRESET_GROUPS.filter((g) => PUBLIC_PRESETS.some((p) => p.group === g));

interface Props { form: PublicForm; submissions: SubmissionRow[]; baseUrl: string }

export function FormsBuilderClient({ form, submissions, baseUrl }: Props) {
  const router = useRouter();
  // The scrim has to outlast the refresh: a local `finally { setBusy(false) }`
  // fires when refresh() is CALLED, not when the server output arrives.
  const { refresh } = useTrackedRefresh();
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [status, setStatus] = useState(form.status);
  const [fields, setFields] = useState<OnboardingField[]>(form.schema ?? []);
  const [settings, setSettings] = useState<PublicFormSettings>(form.settings ?? {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const publicUrl = `${baseUrl}/f/${form.slug}`;
  const dirty = useMemo(() =>
    name !== form.name || description !== (form.description ?? "") || status !== form.status ||
    JSON.stringify(fields) !== JSON.stringify(form.schema ?? []) ||
    JSON.stringify(settings) !== JSON.stringify(form.settings ?? {}),
  [name, description, status, fields, settings, form]);

  const addField = (def: { type: OnboardingFieldType; defaultLabel: string; hasOptions?: boolean }) => {
    const f: OnboardingField = { id: newId(), type: def.type, label: def.defaultLabel, ...(def.hasOptions ? { options: ["Option 1", "Option 2"] } : {}) };
    setFields((p) => [...p, f]); setSelectedId(f.id); setPreview(false);
  };
  const addPreset = (key: string) => {
    const p = PUBLIC_PRESETS.find((x) => x.key === key); if (!p) return;
    const f = fieldFromPreset(p, newId());
    setFields((prev) => [...prev, f]); setSelectedId(f.id); setPreview(false);
  };
  const patchField = (id: string, patch: Partial<OnboardingField>) => setFields((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeField = (id: string) => {
    setFields((p) => p.filter((f) => f.id !== id).map((f) => (f.show_if?.field_id === id ? { ...f, show_if: null } : f)));
    if (selectedId === id) setSelectedId(null);
  };
  const setSetting = (patch: Partial<PublicFormSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const save = async () => {
    if (!name.trim()) return toast.error("The form needs a name");
    setSaving(true);
    try {
      await updatePublicForm(form.id, { name: name.trim(), description: description.trim() || null, status, schema: fields, settings });
      toast.success("Saved"); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  };

  const copy = (t: string, m: string) => navigator.clipboard.writeText(t).then(() => toast.success(m), () => toast.error("Copy failed"));
  const conditionSources = (target: OnboardingField) => {
    const idx = fields.findIndex((f) => f.id === target.id);
    return fields.slice(0, idx).filter((f) => CHOICE_TYPES.has(f.type));
  };
  // Fields eligible for lead mapping (email/phone/text-ish).
  const mappable = fields.filter((f) => !["heading", "divider", "instructions"].includes(f.type));

  return (
    <div>
      <Link href="/forms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Forms
      </Link>

      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0 flex-1 max-w-lg space-y-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-lg font-semibold h-10" placeholder="Form name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-sm" placeholder="Description (optional)" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Save
          </Button>
        </div>
      </div>

      {/* Share bar (published only) */}
      {status === "published" && (
        <Card className="mb-4"><CardContent className="p-3 flex items-center gap-2 flex-wrap text-sm">
          <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[280px]">{publicUrl}</code>
          <Button size="sm" variant="outline" className="h-8" onClick={() => copy(publicUrl, "Public link copied")}><Copy className="w-3.5 h-3.5 mr-1" /> Copy link</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => copy(embedSnippet(baseUrl, form.slug), "Embed code copied")}><CodeIcon className="w-3.5 h-3.5 mr-1" /> Copy embed</Button>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"><ExternalLink className="w-3.5 h-3.5" /> Open</a>
        </CardContent></Card>
      )}

      <Tabs defaultValue="build">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          {/* Replies live on their own tab now, not inside the editor. The
              link keeps the per-form path a click away. */}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/forms?tab=submissions&form=${form.id}`}>
              <ListChecks className="w-3.5 h-3.5 mr-1.5" />
              Submissions ({submissions.length})
            </Link>
          </Button>
        </div>

        {/* ── BUILD ── */}
        <TabsContent value="build" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={() => setPreview((v) => !v)}>
              {preview ? <Pencil className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}{preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="max-w-xl mx-auto">
              <Card><CardContent className="p-6 space-y-5">
                <div><h2 className="text-xl font-bold">{name}</h2>{description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}</div>
                {fields.map((f) => <FormFieldPreview key={f.id} field={f} />)}
                <Button disabled className="w-full">{settings.submit_text || "Submit"}</Button>
              </CardContent></Card>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[220px_1fr_300px]">
              {/* Palette */}
              <Card className="h-fit lg:sticky lg:top-4"><CardContent className="p-3 space-y-3 max-h-[75vh] overflow-y-auto">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">Ready-made</p>
                  <Select value="" onValueChange={addPreset}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add a preset…" /></SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      {PUBLIC_PRESET_GROUPS.map((g) => (
                        <div key={g}>
                          <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                          {PUBLIC_PRESETS.filter((p) => p.group === g).map((p) => <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>)}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {PALETTE.map((group) => (
                  <div key={group.group}>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">{group.group}</p>
                    <div className="grid gap-1">
                      {group.fields.map((def) => (
                        <button key={def.type} onClick={() => addField(def)}
                          className="flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors">
                          <Plus className="w-3 h-3 text-muted-foreground shrink-0" /><span className="flex-1">{def.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent></Card>

              {/* Canvas */}
              <div>
                {fields.length === 0 ? (
                  <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">Add fields from the palette — drag to reorder, click to edit.</CardContent></Card>
                ) : (
                  <Reorder.Group axis="y" values={fields} onReorder={setFields} className="space-y-2">
                    {fields.map((f) => (
                      <Reorder.Item key={f.id} value={f}>
                        <div onClick={() => setSelectedId(f.id)}
                          className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-colors ${selectedId === f.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}>
                          <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium break-words">
                              {f.type === "divider" ? <span className="text-muted-foreground">— divider —</span> : f.label || <span className="text-muted-foreground italic">Untitled</span>}
                              {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                            </p>
                            {f.show_if?.field_id && <p className="text-[11px] text-muted-foreground">conditional</p>}
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{DEF_BY_TYPE[f.type]?.label ?? f.type}</Badge>
                          <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                )}
              </div>

              {/* Field settings */}
              <Card className="h-fit lg:sticky lg:top-4"><CardContent className="p-4 space-y-3">
                {!selected ? <p className="text-sm text-muted-foreground py-6 text-center">Select a field to edit</p> : (
                  <>
                    <Badge variant="outline" className="text-[10px]">{DEF_BY_TYPE[selected.type]?.label ?? selected.type}</Badge>
                    {selected.type !== "divider" && (
                      <div className="space-y-1"><Label className="text-xs">Label</Label>
                        <Input value={selected.label} onChange={(e) => patchField(selected.id, { label: e.target.value })} /></div>
                    )}
                    {!DEF_BY_TYPE[selected.type]?.displayOnly && (
                      <>
                        <div className="space-y-1"><Label className="text-xs">Help text</Label>
                          <Input value={selected.help_text ?? ""} onChange={(e) => patchField(selected.id, { help_text: e.target.value || undefined })} /></div>
                        {DEF_BY_TYPE[selected.type]?.hasPlaceholder && (
                          <div className="space-y-1"><Label className="text-xs">Placeholder</Label>
                            <Input value={selected.placeholder ?? ""} onChange={(e) => patchField(selected.id, { placeholder: e.target.value || undefined })} /></div>
                        )}
                        {DEF_BY_TYPE[selected.type]?.hasOptions && (
                          <div className="space-y-1"><Label className="text-xs">Options (one per line)</Label>
                            <Textarea rows={4} value={(selected.options ?? []).join("\n")} onChange={(e) => patchField(selected.id, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></div>
                        )}
                        <div className="flex items-center justify-between pt-1"><Label className="text-xs">Required</Label>
                          <Switch checked={!!selected.required} onCheckedChange={(v) => patchField(selected.id, { required: v })} /></div>
                        {conditionSources(selected).length > 0 && (
                          <div className="space-y-2 border-t pt-3">
                            <Label className="text-xs">Show only when…</Label>
                            <Select value={selected.show_if?.field_id ?? "__always__"}
                              onValueChange={(v) => patchField(selected.id, { show_if: v === "__always__" ? null : { field_id: v, equals: selected.show_if?.equals ?? "" } })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__always__">Always shown</SelectItem>
                                {conditionSources(selected).map((s) => <SelectItem key={s.id} value={s.id}>{s.label || s.id}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {selected.show_if?.field_id && (() => {
                              const src = fields.find((f) => f.id === selected.show_if!.field_id);
                              const opts = src?.type === "yes_no" ? ["Yes", "No"] : (src?.options ?? []);
                              return (
                                <Select value={selected.show_if.equals || "__pick__"} onValueChange={(v) => patchField(selected.id, { show_if: { field_id: selected.show_if!.field_id, equals: v } })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="equals…" /></SelectTrigger>
                                  <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>= {o}</SelectItem>)}</SelectContent>
                                </Select>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent></Card>
            </div>
          )}
        </TabsContent>

        {/* ── SETTINGS ── */}
        <TabsContent value="settings" className="mt-4">
          <div className="max-w-xl space-y-4">
            <Card><CardContent className="p-5 space-y-4">
              <p className="font-semibold text-sm">After submit</p>
              <div className="space-y-1"><Label className="text-xs">Submit button text</Label>
                <Input value={settings.submit_text ?? ""} placeholder="Submit" onChange={(e) => setSetting({ submit_text: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Thank-you message</Label>
                <Textarea rows={2} value={settings.thank_you_message ?? ""} placeholder="Thanks — we'll be in touch shortly." onChange={(e) => setSetting({ thank_you_message: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Or redirect to a URL (optional)</Label>
                <Input value={settings.redirect_url ?? ""} placeholder="https://yoursite.com/thank-you" onChange={(e) => setSetting({ redirect_url: e.target.value || null })} /></div>
            </CardContent></Card>

            <Card><CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="font-semibold text-sm">Create a lead on submit</p>
                  <p className="text-xs text-muted-foreground">Pushes each submission into your sales pipeline.</p></div>
                <Switch checked={settings.create_lead ?? true} onCheckedChange={(v) => setSetting({ create_lead: v })} />
              </div>
              {(settings.create_lead ?? true) && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["name", "email", "phone"] as const).map((slot) => (
                    <div key={slot} className="space-y-1">
                      <Label className="text-xs capitalize">{slot} field</Label>
                      <Select value={settings.lead_map?.[slot] ?? "__none__"}
                        onValueChange={(v) => setSetting({ lead_map: { ...settings.lead_map, [slot]: v === "__none__" ? undefined : v } })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {mappable.map((f) => <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Map which fields become the lead&apos;s name / email / phone. We also auto-detect email &amp; phone fields if unset.</p>
            </CardContent></Card>

            <Card><CardContent className="p-5 space-y-3">
              <p className="font-semibold text-sm">Notifications</p>
              <div className="space-y-1"><Label className="text-xs">Email these addresses on each submission (comma-separated)</Label>
                <Input value={(settings.notify_emails ?? []).join(", ")} placeholder="you@business.com"
                  onChange={(e) => setSetting({ notify_emails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
            </CardContent></Card>
            <p className="text-xs text-muted-foreground">Remember to <strong>Save</strong> after changing settings.</p>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function fmtAnswer(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === "object" && (v as any).name) return `📎 ${(v as any).name}`;
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}
