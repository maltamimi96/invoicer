"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingField } from "@/types/database";

/** Non-interactive render of a field for builder preview (public form + reuse). */
export function FormFieldPreview({ field: f }: { field: OnboardingField }) {
  if (f.type === "divider") return <hr className="border-border" />;
  if (f.type === "heading") return <h3 className="text-base font-semibold pt-2">{f.label}</h3>;
  if (f.type === "instructions") return <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3">{f.label}</p>;

  const label = f.type !== "consent" && (
    <Label className="text-sm">{f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}</Label>
  );
  const help = f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>;

  const control = (() => {
    switch (f.type) {
      case "long_text": case "address": return <Textarea rows={3} disabled placeholder={f.placeholder} />;
      case "dropdown": case "radio":
        return <Select disabled><SelectTrigger><SelectValue placeholder={f.options?.[0] ?? "Choose…"} /></SelectTrigger><SelectContent /></Select>;
      case "multi_select": case "checkboxes":
        return <div className="space-y-1.5">{(f.options ?? []).map((o) => <label key={o} className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" disabled /> {o}</label>)}</div>;
      case "yes_no": return <div className="flex gap-2"><Button size="sm" variant="outline" disabled>Yes</Button><Button size="sm" variant="outline" disabled>No</Button></div>;
      case "image": case "file": return <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">{f.type === "image" ? "Image upload" : "File upload"}</div>;
      case "rating": return <div className="text-lg tracking-widest text-muted-foreground">☆ ☆ ☆ ☆ ☆</div>;
      case "consent": return <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" disabled className="mt-0.5" /> {f.label}</label>;
      case "date": return <Input type="date" disabled />;
      case "time": return <Input type="time" disabled />;
      case "number": case "currency": return <Input type="number" disabled placeholder={f.placeholder ?? (f.type === "currency" ? "0.00" : "")} />;
      default: return <Input disabled placeholder={f.placeholder} />;
    }
  })();

  return <div className="space-y-1.5">{label}{help}{control}</div>;
}
