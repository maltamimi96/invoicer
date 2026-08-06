"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import type { OnboardingField } from "@/types/database";

/**
 * Renders a business's client-profile fields.
 *
 * One component for both the add-customer form and the customer detail, so the
 * two can't drift into rendering the same field differently. Types not handled
 * here fall back to a text input rather than disappearing — a field the user
 * configured must always be fillable, even if we don't have a bespoke control
 * for it yet.
 */
export function ClientFields({
  fields, values, onChange, disabled, invalidIds = [],
}: {
  fields: OnboardingField[];
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
  disabled?: boolean;
  /** Field ids that failed validation — outlined so the fix is findable
   *  without hunting through the form. */
  invalidIds?: string[];
}) {
  if (fields.length === 0) return null;

  const str = (id: string) => {
    const v = values[id];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        // Layout-only types span the row and render no control.
        if (f.type === "heading") {
          return <h3 key={f.id} className="sm:col-span-2 mt-2 text-sm font-semibold">{f.label}</h3>;
        }
        if (f.type === "divider") {
          return <hr key={f.id} className="sm:col-span-2 border-border" />;
        }
        if (f.type === "instructions") {
          return <p key={f.id} className="sm:col-span-2 text-sm text-muted-foreground">{f.label}</p>;
        }

        const wide = f.type === "long_text" || f.type === "address";
        const control = (() => {
          switch (f.type) {
            case "long_text":
            case "address":
              return <Textarea id={f.id} rows={3} value={str(f.id)} disabled={disabled}
                placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />;

            case "yes_no":
            case "consent":
              return (
                <div className="flex h-9 items-center">
                  <Switch checked={Boolean(values[f.id])} disabled={disabled}
                    onCheckedChange={(v) => onChange(f.id, v)} />
                </div>
              );

            case "dropdown":
            case "radio":
              return (
                <select id={f.id} value={str(f.id)} disabled={disabled}
                  onChange={(e) => onChange(f.id, e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              );

            case "date":
              return <DatePicker id={f.id} value={str(f.id)} clearable disabled={disabled}
                onChange={(v) => onChange(f.id, v)} />;

            case "time":
              return <TimePicker id={f.id} value={str(f.id)} clearable disabled={disabled}
                onChange={(v) => onChange(f.id, v)} />;

            case "number":
            case "rating":
              return <Input id={f.id} type="number" value={str(f.id)} disabled={disabled}
                onChange={(e) => onChange(f.id, e.target.value === "" ? "" : Number(e.target.value))} />;

            case "currency":
              return (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input id={f.id} type="number" step="0.01" className="pl-6" value={str(f.id)} disabled={disabled}
                    onChange={(e) => onChange(f.id, e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
              );

            case "email":
              return <Input id={f.id} type="email" value={str(f.id)} disabled={disabled}
                placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />;

            case "url":
              return <Input id={f.id} type="url" value={str(f.id)} disabled={disabled}
                placeholder={f.placeholder ?? "https://"} onChange={(e) => onChange(f.id, e.target.value)} />;

            case "phone":
              return <Input id={f.id} type="tel" value={str(f.id)} disabled={disabled}
                placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />;

            default:
              // Unknown / not-yet-specialised types stay fillable as text.
              return <Input id={f.id} value={str(f.id)} disabled={disabled}
                placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />;
          }
        })();

        const invalid = invalidIds.includes(f.id);
        return (
          <div
            key={f.id}
            className={`${wide ? "sm:col-span-2 " : ""}${invalid ? "rounded-lg ring-1 ring-destructive/50 p-2 -m-2" : ""}`}
          >
            <Label htmlFor={f.id} className={invalid ? "text-destructive" : undefined}>
              {f.label}{f.required ? " *" : ""}
            </Label>
            {control}
            {f.help_text && <p className="mt-1 text-xs text-muted-foreground">{f.help_text}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only summary for the customer detail page. */
export function ClientFieldsSummary({
  fields, values,
}: {
  fields: OnboardingField[];
  values: Record<string, unknown>;
}) {
  const shown = fields.filter(
    (f) => !["heading", "divider", "instructions"].includes(f.type)
      && values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== "",
  );
  if (shown.length === 0) return null;

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map((f) => {
        const v = values[f.id];
        const display = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
        const isLink = f.type === "url" && /^https?:\/\//i.test(display);
        return (
          <div key={f.id}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="text-sm break-words">
              {isLink
                ? <a href={display} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{display}</a>
                : display}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
