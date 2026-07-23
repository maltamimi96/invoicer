"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Star, Copy, ArrowLeft, ChevronUp, ChevronDown, Upload, Loader2, FileText,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm";
import { PageHeader } from "@/components/layout/page-header";
import type { DocumentTemplate } from "@/types/database";
import type { TemplateConfig, CustomField, FieldPlacement, FontKey } from "@/lib/documents/template-config";
import { DEFAULT_TEMPLATE_CONFIG, DEFAULT_COLUMNS, FONT_LABELS } from "@/lib/documents/template-config";
import { TEMPLATE_PRESETS } from "@/lib/documents/presets";
import {
  createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate,
  setDefaultDocumentTemplate, uploadTemplateAsset,
} from "@/lib/actions/document-templates";

type DocType = "invoice" | "quote" | "both";

function mergeConfig(partial?: unknown): TemplateConfig {
  const c = { ...DEFAULT_TEMPLATE_CONFIG, ...((partial as Partial<TemplateConfig>) ?? {}) } as TemplateConfig;
  if (!Array.isArray(c.columns) || c.columns.length === 0) c.columns = DEFAULT_COLUMNS.map((x) => ({ ...x }));
  if (!Array.isArray(c.custom_fields)) c.custom_fields = [];
  return c;
}

export function DocumentTemplatesClient({ initialTemplates }: { initialTemplates: DocumentTemplate[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState(initialTemplates);
  useEffect(() => setTemplates(initialTemplates), [initialTemplates]);

  // null = manager view; object = editing (id null means brand-new).
  const [editing, setEditing] = useState<null | { id: string | null; name: string; doc_type: DocType; config: TemplateConfig }>(null);
  const [gallery, setGallery] = useState(false);

  const startNewFromPreset = (presetKey: string | null) => {
    const preset = presetKey ? TEMPLATE_PRESETS.find((p) => p.key === presetKey) : null;
    setGallery(false);
    setEditing({
      id: null,
      name: preset ? preset.name : "My template",
      doc_type: "both",
      config: mergeConfig(preset?.config ?? null),
    });
  };

  const editExisting = (tpl: DocumentTemplate) =>
    setEditing({ id: tpl.id, name: tpl.name, doc_type: tpl.doc_type, config: mergeConfig(tpl.config) });

  if (editing) {
    return <TemplateEditor editing={editing} setEditing={setEditing} onSaved={() => { setEditing(null); router.refresh(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="Document Templates"
        subtitle="Design the look of your invoice and quote PDFs. Save as many as you like and set a default."
        actions={<Button onClick={() => setGallery(true)}><Plus className="w-4 h-4 mr-1.5" />New template</Button>}
      />

      {templates.length === 0 ? (
        <div className="ch-empty text-center py-16">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground mb-4">Your invoices and quotes currently use the built-in default. Create a template to customise them.</p>
          <Button onClick={() => setGallery(true)}><Plus className="w-4 h-4 mr-1.5" />Create your first template</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => {
            const cfg = mergeConfig(tpl.config);
            return (
              <div key={tpl.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-4 h-4 rounded-full border border-border" style={{ background: cfg.primary_color }} />
                      <h3 className="font-semibold break-words">{tpl.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="ch-pill text-[10px] uppercase">{tpl.doc_type}</span>
                      {tpl.is_default && <span className="ch-pill paid text-[10px] flex items-center gap-0.5"><Star className="w-3 h-3" />Default</span>}
                    </div>
                  </div>
                </div>
                {/* Mini preview swatch */}
                <div className="h-24 rounded-lg border border-border mb-3 overflow-hidden flex flex-col" style={{ background: cfg.background_color }}>
                  <div className="h-6" style={{ background: cfg.base === "modern" ? cfg.secondary_color : "transparent" }} />
                  <div className="px-2 py-1"><div className="h-2 w-1/2 rounded" style={{ background: cfg.primary_color }} /></div>
                  <div className="px-2 space-y-1 mt-1">
                    <div className="h-1.5 w-full rounded" style={{ background: cfg.table_header_bg }} />
                    <div className="h-1 w-3/4 rounded bg-border" />
                    <div className="h-1 w-2/3 rounded bg-border" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => editExisting(tpl)}>Edit</Button>
                  {!tpl.is_default && (
                    <Button size="sm" variant="ghost" onClick={async () => { await setDefaultDocumentTemplate(tpl.id); router.refresh(); }}>
                      <Star className="w-3.5 h-3.5 mr-1" />Set default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => {
                    await createDocumentTemplate({ name: `${tpl.name} copy`, doc_type: tpl.doc_type, config: cfg });
                    router.refresh();
                  }}><Copy className="w-3.5 h-3.5 mr-1" />Duplicate</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                    if (!(await confirm({ title: "Delete this template?", body: "Documents using it will fall back to the default." }))) return;
                    await deleteDocumentTemplate(tpl.id); router.refresh();
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gallery && <PresetGallery onPick={startNewFromPreset} onClose={() => setGallery(false)} />}
    </div>
  );
}

function PresetGallery({ onPick, onClose }: { onPick: (key: string | null) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Start from a template</h2>
        <p className="text-sm text-muted-foreground mb-4">Pick a ready-made style — you can change everything after.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => onPick(null)} className="text-left rounded-xl border-2 border-dashed border-border p-4 hover:border-primary transition">
            <div className="font-medium">Blank</div>
            <div className="text-xs text-muted-foreground">Start from the default look</div>
          </button>
          {TEMPLATE_PRESETS.map((p) => (
            <button key={p.key} onClick={() => onPick(p.key)} className="text-left rounded-xl border border-border p-4 hover:border-primary hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-4 h-4 rounded-full border border-border" style={{ background: p.swatch }} />
                <span className="font-medium">{p.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">{p.description}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 text-right"><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

type EditState = { id: string | null; name: string; doc_type: DocType; config: TemplateConfig };

function TemplateEditor({ editing, setEditing, onSaved }: {
  editing: EditState;
  setEditing: (s: EditState | null) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing.name);
  const [docType, setDocType] = useState<DocType>(editing.doc_type);
  const [config, setConfig] = useState<TemplateConfig>(editing.config);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<"invoice" | "quote">(editing.doc_type === "quote" ? "quote" : "invoice");
  const [uploading, setUploading] = useState(false);
  const lastUrl = useRef<string | null>(null);

  const set = useCallback(<K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value })), []);

  // Debounced live preview.
  const cfgKey = useMemo(() => JSON.stringify(config) + previewDoc, [config, previewDoc]);
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch("/api/pdf/template-preview", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_type: previewDoc, config }),
        });
        if (!res.ok || cancelled) { setPreviewing(false); return; }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setPreviewUrl(url);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing.id) await updateDocumentTemplate(editing.id, { name, doc_type: docType, config });
      else await createDocumentTemplate({ name, doc_type: docType, config });
      onSaved();
    } finally { setSaving(false); }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { url } = await uploadTemplateAsset(fd);
      set("background_image_url", url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ArrowLeft className="w-4 h-4" /></Button>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs font-semibold" placeholder="Template name" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button onClick={() => setPreviewDoc("invoice")} className={`px-3 py-1.5 ${previewDoc === "invoice" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Invoice</button>
            <button onClick={() => setPreviewDoc("quote")} className={`px-3 py-1.5 ${previewDoc === "quote" ? "bg-primary text-primary-foreground" : "bg-card"}`}>Quote</button>
          </div>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}Save
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start">
        {/* Controls */}
        <div className="space-y-3 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto pr-1">
          <Section title="Basics">
            <Field label="Applies to">
              <Select value={docType} onChange={(v) => setDocType(v as DocType)} options={[["both", "Invoices & quotes"], ["invoice", "Invoices only"], ["quote", "Quotes only"]]} />
            </Field>
            <Field label="Layout">
              <Select value={config.base} onChange={(v) => set("base", v as TemplateConfig["base"])} options={[["classic", "Classic"], ["minimal", "Minimal"], ["modern", "Modern (header band)"]]} />
            </Field>
          </Section>

          <Section title="Colours">
            <Color label="Primary / accent" value={config.primary_color} onChange={(v) => set("primary_color", v)} />
            <Color label="Header band / dark" value={config.secondary_color} onChange={(v) => set("secondary_color", v)} />
            <Color label="Heading text" value={config.heading_color} onChange={(v) => set("heading_color", v)} />
            <Color label="Body text" value={config.text_color} onChange={(v) => set("text_color", v)} />
            <Color label="Muted text" value={config.muted_color} onChange={(v) => set("muted_color", v)} />
            <Color label="Table header" value={config.table_header_bg} onChange={(v) => set("table_header_bg", v)} />
          </Section>

          <Section title="Typography">
            <Field label="Font">
              <Select value={config.font_family} onChange={(v) => set("font_family", v as FontKey)} options={Object.entries(FONT_LABELS)} />
            </Field>
            <Field label={`Text size (${config.font_scale.toFixed(2)}×)`}>
              <input type="range" min={0.9} max={1.2} step={0.05} value={config.font_scale} onChange={(e) => set("font_scale", parseFloat(e.target.value))} className="w-full" />
            </Field>
          </Section>

          <Section title="Logo & header">
            <Toggle label="Show logo" checked={config.show_logo} onChange={(v) => set("show_logo", v)} />
            <Field label="Logo size">
              <Select value={String(config.logo_size)} onChange={(v) => set("logo_size", Number(v))} options={[["48", "Small"], ["72", "Medium"], ["108", "Large"]]} />
            </Field>
            <Field label="Logo position">
              <Select value={config.logo_position} onChange={(v) => set("logo_position", v as TemplateConfig["logo_position"])} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
            </Field>
            <Field label="Header note (optional)">
              <Input value={config.header_text ?? ""} onChange={(e) => set("header_text", e.target.value || null)} placeholder="e.g. Licensed & insured" />
            </Field>
            <Field label="Footer note (optional)">
              <Input value={config.footer_text ?? ""} onChange={(e) => set("footer_text", e.target.value || null)} placeholder="Shown at the bottom of every page" />
            </Field>
          </Section>

          <Section title="Background">
            <Color label="Page colour" value={config.background_color} onChange={(v) => set("background_color", v)} />
            <Field label="Background / letterhead image">
              {config.background_image_url ? (
                <div className="flex items-center gap-2">
                  <img src={config.background_image_url} alt="" className="w-10 h-10 object-cover rounded border border-border" />
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => set("background_image_url", null)}>Remove</Button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-dashed border-border px-3 py-2 hover:border-primary">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? "Uploading…" : "Upload image"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                </label>
              )}
            </Field>
            {config.background_image_url && (
              <Field label={`Image opacity (${Math.round(config.background_image_opacity * 100)}%)`}>
                <input type="range" min={0.05} max={1} step={0.05} value={config.background_image_opacity} onChange={(e) => set("background_image_opacity", parseFloat(e.target.value))} className="w-full" />
              </Field>
            )}
            <Field label="Watermark text (optional)">
              <Input value={config.watermark_text ?? ""} onChange={(e) => set("watermark_text", e.target.value || null)} placeholder="e.g. DRAFT" />
            </Field>
          </Section>

          <Section title="Labels & titles">
            <Field label="Document title"><Input value={config.document_title} onChange={(e) => set("document_title", e.target.value)} /></Field>
            <Field label="Tax label"><Input value={config.label_tax} onChange={(e) => set("label_tax", e.target.value)} /></Field>
            <Field label={'"Bill to" heading'}><Input value={config.section_title_billto} onChange={(e) => set("section_title_billto", e.target.value)} /></Field>
            <Field label="Items heading"><Input value={config.section_title_items} onChange={(e) => set("section_title_items", e.target.value)} /></Field>
            <Field label="Notes heading"><Input value={config.section_title_notes} onChange={(e) => set("section_title_notes", e.target.value)} /></Field>
            <Field label="Payment heading"><Input value={config.section_title_payment} onChange={(e) => set("section_title_payment", e.target.value)} /></Field>
          </Section>

          <Section title="Sections">
            <Toggle label="Notes" checked={config.show_notes} onChange={(v) => set("show_notes", v)} />
            <Toggle label="Terms" checked={config.show_terms} onChange={(v) => set("show_terms", v)} />
            <Toggle label="Payment details" checked={config.show_payment_details} onChange={(v) => set("show_payment_details", v)} />
            <Toggle label="Footer" checked={config.show_footer} onChange={(v) => set("show_footer", v)} />
            <Toggle label="Quote signature page" checked={config.show_signature} onChange={(v) => set("show_signature", v)} />
          </Section>

          <Section title="Line-item columns">
            <ColumnsEditor config={config} setConfig={setConfig} />
          </Section>

          <Section title="Custom fields">
            <CustomFieldsEditor config={config} setConfig={setConfig} />
          </Section>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-border bg-muted/30 overflow-hidden lg:sticky lg:top-4 min-h-[70vh] relative">
          {previewing && <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-xs bg-card/90 border border-border rounded-full px-2.5 py-1"><Loader2 className="w-3 h-3 animate-spin" />Rendering…</div>}
          {previewUrl ? (
            <iframe title="preview" src={previewUrl} className="w-full h-[80vh] bg-white" />
          ) : (
            <div className="h-[80vh] flex items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnsEditor({ config, setConfig }: { config: TemplateConfig; setConfig: (fn: (c: TemplateConfig) => TemplateConfig) => void }) {
  const cols = config.columns;
  const move = (i: number, dir: -1 | 1) => setConfig((c) => {
    const next = [...c.columns]; const j = i + dir;
    if (j < 0 || j >= next.length) return c;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...c, columns: next };
  });
  return (
    <div className="space-y-2">
      {cols.map((col, i) => (
        <div key={col.key} className="flex items-center gap-2">
          <Switch checked={col.visible} onCheckedChange={(v) => setConfig((c) => ({ ...c, columns: c.columns.map((x) => x.key === col.key ? { ...x, visible: v } : x) }))} />
          <Input value={col.label} onChange={(e) => setConfig((c) => ({ ...c, columns: c.columns.map((x) => x.key === col.key ? { ...x, label: e.target.value } : x) }))} className="h-8 flex-1" />
          <span className="text-[10px] uppercase text-muted-foreground w-16 truncate">{col.key.replace("_", " ")}</span>
          <div className="flex flex-col">
            <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground"><ChevronDown className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">The Description column always shows. On quotes, an item numbered # column is always shown too.</p>
    </div>
  );
}

function CustomFieldsEditor({ config, setConfig }: { config: TemplateConfig; setConfig: (fn: (c: TemplateConfig) => TemplateConfig) => void }) {
  const add = () => setConfig((c) => ({
    ...c,
    custom_fields: [...c.custom_fields, { id: `f${c.custom_fields.length + 1}-${c.custom_fields.length}`, label: "Label", value: "", placement: "meta" as FieldPlacement }],
  }));
  const update = (id: string, patch: Partial<CustomField>) =>
    setConfig((c) => ({ ...c, custom_fields: c.custom_fields.map((f) => f.id === id ? { ...f, ...patch } : f) }));
  const remove = (id: string) => setConfig((c) => ({ ...c, custom_fields: c.custom_fields.filter((f) => f.id !== id) }));
  return (
    <div className="space-y-2">
      {config.custom_fields.map((f) => (
        <div key={f.id} className="rounded-lg border border-border p-2 space-y-1.5">
          <div className="flex gap-1.5">
            <Input value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} placeholder="Label" className="h-8" />
            <button onClick={() => remove(f.id)} className="text-destructive px-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <Input value={f.value} onChange={(e) => update(f.id, { value: e.target.value })} placeholder="Value — supports {{customer_name}}, {{document_number}}…" className="h-8" />
          <Select value={f.placement} onChange={(v) => update(f.id, { placement: v as FieldPlacement })} options={[["header", "In the header"], ["meta", "Near the dates"], ["footer", "In the footer"]]} />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}><Plus className="w-3.5 h-3.5 mr-1" />Add field</Button>
    </div>
  );
}

// ── tiny primitives ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-muted-foreground block mb-1">{label}</label>{children}</div>;
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-border p-0.5 bg-card cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-xs" />
      </div>
    </Field>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-9 rounded-md border border-border bg-card px-2 text-sm">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
