"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, RefreshCw } from "@/components/ui/icons";
import {
  saveClientFields, resetClientFieldsToPreset, saveClientAccountTypes, type ClientFieldConfig,
} from "@/lib/actions/client-fields";
import type { AccountTypeOption } from "@/lib/customers/account-types";
import { ClientFields } from "@/components/customers/client-fields";
import type { OnboardingField, OnboardingFieldType } from "@/types/database";

/** Types that make sense on a client profile. `secure` is deliberately absent —
 *  a profile is visible to everyone who can see the customer. */
const TYPES: { value: OnboardingFieldType; label: string }[] = [
  { value: "short_text", label: "Text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Money" },
  { value: "dropdown", label: "Dropdown" },
  { value: "yes_no", label: "Yes / no" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link" },
  { value: "address", label: "Address" },
  { value: "heading", label: "Section heading" },
];

const HAS_OPTIONS = new Set(["dropdown", "radio", "multi_select", "checkboxes"]);
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

export function ClientFieldsSettings({ config }: { config: ClientFieldConfig }) {
  const router = useRouter();
  const [fields, setFields] = useState<OnboardingField[]>(config.fields);
  const [types, setTypes] = useState<AccountTypeOption[]>(config.accountTypes);
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [savingTypes, setSavingTypes] = useState(false);

  const saveTypes = async () => {
    setSavingTypes(true);
    try {
      const res = await saveClientAccountTypes(types);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Saved — ${res.count} client type${res.count === 1 ? "" : "s"}`);
      router.refresh();
    } finally { setSavingTypes(false); }
  };

  const update = (i: number, patch: Partial<OnboardingField>) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const add = () => setFields((prev) => [
    ...prev,
    { id: `field_${prev.length + 1}_${Date.now().toString(36)}`, type: "short_text", label: "New field" },
  ]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveClientFields(fields);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Saved — ${res.count} field${res.count === 1 ? "" : "s"} on the client form`);
      router.refresh();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title="Client fields"
        subtitle="What you record about a client, beyond name and contact details."
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={async () => {
              if (!confirm("Reset client types AND fields to your industry's defaults? Anything you've added here is removed — answers already saved on clients stay in the database but stop being shown.")) return;
              const res = await resetClientFieldsToPreset();
              if (!res.ok) { toast.error(res.error); return; }
              toast.success("Back to the preset defaults");
              router.refresh();
            }}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Reset to preset
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
            </Button>
          </>
        }
      />

      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <p className="text-sm">
          {config.usingPresetDefaults
            ? <>These are the defaults for <strong>{config.industryPreset ?? "your business"}</strong>. Change anything and it becomes yours — the preset stops applying.</>
            : <>You&rsquo;ve customised these. <em>Reset to preset</em> puts back your industry&rsquo;s defaults.</>}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Name, email, phone, company and address are always present and aren&rsquo;t listed here. Credentials belong
          in an onboarding form, not a client profile — anyone who can see the client can see these.
        </p>
      </div>

      {/* Client types — the dropdown at the top of every client form. Was a
          fixed trades list (Strata, Builder, Property manager), which an
          agency had no use for. */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Client types</h2>
            <p className="text-xs text-muted-foreground">
              The dropdown at the top of the client form. Every client is saved with one, so keep at least one.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={savingTypes} onClick={saveTypes}>
            {savingTypes && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save types
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {types.map((t, i) => (
            <div key={t.value} className="flex items-center gap-2">
              <Input
                value={t.label}
                className="flex-1"
                onChange={(e) => {
                  const label = e.target.value;
                  // Same rule as the fields: once clients are saved against a
                  // value, renaming must not change the stored value.
                  const isFresh = /^type_\d+_/.test(t.value);
                  setTypes((p) => p.map((x, idx) => idx === i
                    ? { ...x, label, ...(isFresh ? { value: slug(label) || x.value } : {}) } : x));
                }}
              />
              <Input
                value={t.hint ?? ""}
                placeholder="Hint (optional)"
                className="flex-1"
                onChange={(e) => setTypes((p) => p.map((x, idx) => idx === i ? { ...x, hint: e.target.value } : x))}
              />
              <button
                onClick={() => setTypes((p) => p.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${t.label}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTypes((p) => [
              ...p, { value: `type_${p.length + 1}_${Date.now().toString(36)}`, label: "New type" },
            ])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add type
            </Button>
            <p className="text-xs text-muted-foreground">
              Clients already saved under a removed type keep it — it stays selectable on those clients only.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {fields.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No extra fields. Clients will show just the standard contact details.
            </p>
          )}

          {fields.map((f, i) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Input value={f.label} className="flex-1"
                  onChange={(e) => {
                    const label = e.target.value;
                    // Keep the id stable once answers may exist — regenerating it
                    // would orphan every answer already saved under the old one.
                    const isFresh = /^field_\d+_/.test(f.id);
                    update(i, isFresh ? { label, id: slug(label) || f.id } : { label });
                  }} />
                <select value={f.type}
                  onChange={(e) => update(i, { type: e.target.value as OnboardingFieldType })}
                  className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button onClick={() => setFields((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove"
                  className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {HAS_OPTIONS.has(f.type) && (
                <div>
                  <Label htmlFor={`opt-${f.id}`} className="text-xs">Options (one per line)</Label>
                  <textarea id={`opt-${f.id}`} rows={3} value={(f.options ?? []).join("\n")}
                    onChange={(e) => update(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    className="w-full rounded-md border border-input bg-card p-2 text-sm" />
                </div>
              )}

              <p className="mt-2 text-[11px] text-muted-foreground">
                Stored as <code>{f.id}</code>
              </p>
            </div>
          ))}

          <Button variant="outline" onClick={add}>
            <Plus className="mr-1.5 h-4 w-4" /> Add field
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How it looks on a client
          </p>
          <div className="rounded-xl border border-border bg-card p-5">
            <ClientFields fields={fields} values={preview}
              onChange={(id, v) => setPreview((p) => ({ ...p, [id]: v }))} />
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing extra to show.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
