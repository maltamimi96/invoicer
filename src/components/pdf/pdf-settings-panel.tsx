"use client";

import { useState, useTransition } from "react";
import { Settings2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { savePdfSettings } from "@/lib/actions/business";
import { DEFAULT_PDF_SETTINGS, type PdfSettings, type Business } from "@/types/database";

interface PdfSettingsPanelProps {
  settings: PdfSettings;
  business: Business;
  mode: "invoice" | "quote";
  onSettingsChange?: (s: PdfSettings) => void;
}

const INVOICE_TEMPLATES: { id: PdfSettings["invoice_template"]; label: string; preview: React.ReactNode }[] = [
  {
    id: "classic",
    label: "Classic",
    preview: (
      <div className="w-full h-16 bg-white border rounded overflow-hidden text-[5px] p-1.5 flex flex-col gap-0.5">
        <div className="flex justify-between items-start">
          <div className="w-5 h-3 bg-gray-200 rounded-sm" />
          <div className="text-blue-600 font-bold text-[7px]">INVOICE</div>
        </div>
        <div className="h-0.5 bg-gray-100 mt-0.5" />
        <div className="flex-1 space-y-0.5 mt-0.5">
          <div className="h-1 bg-blue-50 rounded-sm w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
        </div>
      </div>
    ),
  },
  {
    id: "modern",
    label: "Modern",
    preview: (
      <div className="w-full h-16 bg-white border rounded overflow-hidden text-[5px] p-0 flex flex-col">
        <div className="bg-gray-900 px-1.5 py-1 flex justify-between items-center">
          <div className="w-5 h-3 bg-gray-600 rounded-sm" />
          <div className="text-white font-bold text-[7px]">INVOICE</div>
        </div>
        <div className="flex-1 p-1.5 space-y-0.5">
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-blue-100 w-3/4" />
        </div>
      </div>
    ),
  },
  {
    id: "minimal",
    label: "Minimal",
    preview: (
      <div className="w-full h-16 bg-white border rounded overflow-hidden text-[5px] p-1.5 flex flex-col gap-0.5">
        <div className="flex justify-between items-start">
          <div className="w-5 h-3 bg-gray-200 rounded-sm" />
          <div className="font-bold text-[7px] text-gray-800">INVOICE</div>
        </div>
        <div className="h-px bg-gray-800 mt-0.5" />
        <div className="flex-1 space-y-0.5 mt-0.5">
          <div className="h-0.5 bg-gray-200 w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
        </div>
      </div>
    ),
  },
];

const QUOTE_TEMPLATES: { id: PdfSettings["quote_template"]; label: string; preview: React.ReactNode }[] = [
  {
    id: "pro",
    label: "Pro",
    preview: (
      <div className="w-full h-16 bg-white border rounded overflow-hidden flex flex-col">
        <div className="h-4 bg-gray-900 flex items-center justify-center">
          <div className="text-amber-400 font-bold text-[6px] tracking-widest">QUOTATION</div>
        </div>
        <div className="flex-1 p-1.5 space-y-0.5">
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
          <div className="h-0.5 bg-amber-100 w-3/4" />
        </div>
      </div>
    ),
  },
  {
    id: "classic",
    label: "Classic",
    preview: (
      <div className="w-full h-16 bg-white border rounded overflow-hidden text-[5px] p-1.5 flex flex-col gap-0.5">
        <div className="flex justify-between items-start">
          <div className="w-5 h-3 bg-gray-200 rounded-sm" />
          <div className="text-blue-600 font-bold text-[7px]">QUOTE</div>
        </div>
        <div className="h-0.5 bg-gray-100 mt-0.5" />
        <div className="flex-1 space-y-0.5 mt-0.5">
          <div className="h-1 bg-blue-50 rounded-sm w-full" />
          <div className="h-0.5 bg-gray-100 w-full" />
        </div>
      </div>
    ),
  },
];

const COLOR_PRESETS = [
  { label: "Blue",    value: "#2563eb" },
  { label: "Indigo",  value: "#4f46e5" },
  { label: "Violet",  value: "#7c3aed" },
  { label: "Emerald", value: "#059669" },
  { label: "Amber",   value: "#d97706" },
  { label: "Rose",    value: "#e11d48" },
  { label: "Slate",   value: "#475569" },
  { label: "Black",   value: "#111827" },
];

export function PdfSettingsPanel({ settings: initial, business, mode, onSettingsChange }: PdfSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<PdfSettings>({ ...DEFAULT_PDF_SETTINGS, ...initial });
  const [isPending, start] = useTransition();

  // Bank detail values — editable, pre-filled from business
  const [bank, setBank] = useState({
    bank_name: business.bank_name ?? "",
    bank_account_name: business.bank_account_name ?? "",
    bank_account_number: business.bank_account_number ?? "",
    bank_sort_code: business.bank_sort_code ?? "",
    bank_iban: business.bank_iban ?? "",
  });

  const update = (patch: Partial<PdfSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    onSettingsChange?.(next);
  };

  const handleSave = () => {
    start(async () => {
      try {
        await savePdfSettings(s, {
          bank_name: bank.bank_name || null,
          bank_account_name: bank.bank_account_name || null,
          bank_account_number: bank.bank_account_number || null,
          bank_sort_code: bank.bank_sort_code || null,
          bank_iban: bank.bank_iban || null,
        });
        toast.success("Template settings saved");
        setOpen(false);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  const templates = mode === "invoice" ? INVOICE_TEMPLATES : QUOTE_TEMPLATES;
  const currentTemplate = mode === "invoice" ? s.invoice_template : s.quote_template;

  const bField = (k: keyof typeof bank) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setBank((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="w-3.5 h-3.5" />
          Template
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>PDF Template</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">

          {/* Template picker */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</Label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update(
                    mode === "invoice"
                      ? { invoice_template: t.id as PdfSettings["invoice_template"] }
                      : { quote_template: t.id as PdfSettings["quote_template"] }
                  )}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${currentTemplate === t.id ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
                >
                  {t.preview}
                  {currentTemplate === t.id && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <p className="text-xs text-center mt-1 pb-1 font-medium">{t.label}</p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Accent colour */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accent colour</Label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => update({ primary_color: c.value })}
                  title={c.label}
                  className={`h-8 rounded-md border-2 transition-all ${s.primary_color === c.value ? "border-foreground scale-105" : "border-transparent hover:border-muted-foreground/40"}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded border shrink-0" style={{ backgroundColor: s.primary_color }} />
              <Input
                value={s.primary_color}
                onChange={(e) => update({ primary_color: e.target.value })}
                className="font-mono text-sm h-8"
                maxLength={7}
              />
            </div>
          </div>

          <Separator />

          {/* Logo size */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logo size</Label>
            <div className="grid grid-cols-3 gap-2">
              {([{ label: "Small", value: 48 }, { label: "Medium", value: 72 }, { label: "Large", value: 108 }] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ logo_size: opt.value })}
                  className={`py-2 rounded-md border text-sm font-medium transition-all ${s.logo_size === opt.value ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-muted-foreground/50"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "invoice" && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice title</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["INVOICE", "TAX INVOICE"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => update({ invoice_title: v })}
                      className={`py-2 rounded-md border text-xs font-medium transition-all ${s.invoice_title === v ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-muted-foreground/50"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Tax label */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tax label</Label>
            <div className="grid grid-cols-3 gap-2">
              {["GST", "VAT", "Tax"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update({ label_tax: v })}
                  className={`py-2 rounded-md border text-sm font-medium transition-all ${s.label_tax === v ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-muted-foreground/50"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Input
              value={s.label_tax}
              onChange={(e) => update({ label_tax: e.target.value })}
              placeholder="Custom..."
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          {/* Payment details — values + labels */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment details</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Edit values and field labels shown on the PDF.</p>
            </div>

            {([
              { valueKey: "bank_name",          labelKey: "label_bank",           valuePlaceholder: "e.g. Commonwealth Bank", labelPlaceholder: "Bank" },
              { valueKey: "bank_account_name",   labelKey: "label_account_name",   valuePlaceholder: "e.g. Acme Pty Ltd",       labelPlaceholder: "Account name" },
              { valueKey: "bank_account_number", labelKey: "label_account_number", valuePlaceholder: "e.g. 123456789",          labelPlaceholder: "Account number" },
              { valueKey: "bank_sort_code",      labelKey: "label_bsb",            valuePlaceholder: "e.g. 062-000",            labelPlaceholder: "BSB" },
              { valueKey: "bank_iban",           labelKey: null,                   valuePlaceholder: "IBAN (optional)",         labelPlaceholder: null },
            ] as const).map(({ valueKey, labelKey, valuePlaceholder, labelPlaceholder }) => (
              <div key={valueKey} className="space-y-1">
                <div className="flex gap-2">
                  {labelKey && (
                    <div className="w-24 shrink-0">
                      <Label className="text-xs text-muted-foreground">Label</Label>
                      <Input
                        value={s[labelKey]}
                        onChange={(e) => update({ [labelKey]: e.target.value })}
                        placeholder={labelPlaceholder ?? ""}
                        className="h-7 text-xs mt-0.5"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Value</Label>
                    <Input
                      value={bank[valueKey]}
                      onChange={bField(valueKey)}
                      placeholder={valuePlaceholder}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 pb-6">
            <Button className="w-full" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save template settings
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
