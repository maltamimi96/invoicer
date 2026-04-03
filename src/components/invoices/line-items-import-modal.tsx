"use client";

import { useState } from "react";
import { Sparkles, Loader2, Plus, Trash2, ClipboardPaste, TableProperties } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import type { LineItem } from "@/types/database";

function calcItem(raw: Omit<LineItem, "subtotal" | "tax_amount" | "total">): LineItem {
  const subtotal = raw.quantity * raw.unit_price * (1 - raw.discount_percent / 100);
  const tax_amount = (subtotal * raw.tax_rate) / 100;
  return { ...raw, subtotal, tax_amount, total: subtotal + tax_amount };
}

interface ParsedRow {
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface LineItemsImportModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (items: LineItem[]) => void;
  currency?: string;
  defaultTaxRate?: number;
}

export function LineItemsImportModal({
  open,
  onOpenChange,
  onImport,
  currency = "AUD",
  defaultTaxRate = 10,
}: LineItemsImportModalProps) {
  // ── Paste & AI parse ──
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);

  // ── Manual bulk ──
  const [manualRows, setManualRows] = useState<ParsedRow[]>([
    { name: "", description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate },
  ]);

  const handleParse = async () => {
    if (!pasteText.trim()) { toast.error("Paste some text first"); return; }
    setParsing(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "parse_line_items", text: pasteText, defaultTaxRate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!Array.isArray(data.result) || data.result.length === 0) {
        toast.error("No items found — try reformatting your text");
        return;
      }
      setParsed(data.result.map((r: Partial<ParsedRow>) => ({
        name: r.name ?? "",
        description: r.description ?? "",
        quantity: Number(r.quantity) || 1,
        unit_price: Number(r.unit_price) || 0,
        tax_rate: Number(r.tax_rate) ?? defaultTaxRate,
      })));
      toast.success(`${data.result.length} items extracted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const updateParsed = (i: number, field: keyof ParsedRow, value: string | number) => {
    setParsed((p) => p.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };

  const removeParsed = (i: number) => setParsed((p) => p.filter((_, idx) => idx !== i));

  const handleImportParsed = () => {
    if (parsed.length === 0) { toast.error("Nothing to import"); return; }
    onImport(parsed.map((r) => calcItem({ id: uuidv4(), name: r.name, description: r.description, quantity: r.quantity, unit_price: r.unit_price, tax_rate: r.tax_rate, discount_percent: 0 })));
    setPasteText("");
    setParsed([]);
    onOpenChange(false);
    toast.success(`${parsed.length} items added`);
  };

  // ── Manual ──
  const addManualRow = () =>
    setManualRows((p) => [...p, { name: "", description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate }]);

  const updateManual = (i: number, field: keyof ParsedRow, value: string | number) =>
    setManualRows((p) => p.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const removeManual = (i: number) =>
    setManualRows((p) => p.filter((_, idx) => idx !== i));

  const handleImportManual = () => {
    const valid = manualRows.filter((r) => r.name.trim());
    if (valid.length === 0) { toast.error("Add at least one item with a name"); return; }
    onImport(valid.map((r) => calcItem({ id: uuidv4(), name: r.name, description: r.description, quantity: r.quantity, unit_price: r.unit_price, tax_rate: r.tax_rate, discount_percent: 0 })));
    setManualRows([{ name: "", description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate }]);
    onOpenChange(false);
    toast.success(`${valid.length} items added`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import line items</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="paste" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="paste" className="flex-1 gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />Paste &amp; AI parse
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 gap-1.5">
              <TableProperties className="w-3.5 h-3.5" />Manual bulk entry
            </TabsTrigger>
          </TabsList>

          {/* ── Paste tab ── */}
          <TabsContent value="paste" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
            {parsed.length === 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Paste your quote text</Label>
                  <p className="text-xs text-muted-foreground">
                    Paste anything — a Gemini response, a markdown table, a bullet list, CSV rows, or plain text. Claude will extract the line items.
                  </p>
                  <Textarea
                    placeholder={`Paste from Gemini, a spreadsheet, or anywhere. Examples:\n\n| Item | Qty | Price |\n| Roof tile replacement | 1 | $2,400 |\n\nor:\n\n- Labour: 8 hours @ $95/hr\n- Materials: tiles, mortar, capping\n- Clean-up fee: $150`}
                    rows={10}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="font-mono text-sm resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleParse} disabled={parsing || !pasteText.trim()} className="gap-1.5">
                    {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {parsing ? "Parsing..." : "Parse with AI"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{parsed.length} items extracted — review before importing</p>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setParsed([])}>
                    ← Back to paste
                  </Button>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
                  <div className="hidden md:grid grid-cols-[1fr_70px_90px_70px_28px] gap-2 px-1 pb-1">
                    {["Item / Description", "Qty", "Unit price", "Tax %", ""].map((h) => (
                      <p key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</p>
                    ))}
                  </div>
                  {parsed.map((row, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_70px_90px_70px_28px] gap-2 p-2 rounded-lg border bg-muted/20">
                      <div className="space-y-1">
                        <Input value={row.name} onChange={(e) => updateParsed(i, "name", e.target.value)} placeholder="Item name" className="h-7 text-sm font-medium" />
                        <Input value={row.description} onChange={(e) => updateParsed(i, "description", e.target.value)} placeholder="Description" className="h-7 text-xs text-muted-foreground" />
                      </div>
                      <Input type="number" value={row.quantity} onChange={(e) => updateParsed(i, "quantity", parseFloat(e.target.value) || 1)} className="h-7 text-sm text-center" />
                      <Input type="number" value={row.unit_price} onChange={(e) => updateParsed(i, "unit_price", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                      <Input type="number" value={row.tax_rate} onChange={(e) => updateParsed(i, "tax_rate", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeParsed(i)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Total: {formatCurrency(parsed.reduce((s, r) => s + r.quantity * r.unit_price, 0), currency)} ex tax
                  </p>
                  <Button onClick={handleImportParsed} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Add {parsed.length} items to quote
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Manual tab ── */}
          <TabsContent value="manual" className="flex-1 flex flex-col min-h-0 mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Fill in rows directly. Leave price as 0 for "Included" items.</p>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
              <div className="hidden md:grid grid-cols-[1fr_70px_90px_70px_28px] gap-2 px-1 pb-1">
                {["Item / Description", "Qty", "Unit price", "Tax %", ""].map((h) => (
                  <p key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</p>
                ))}
              </div>
              {manualRows.map((row, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_70px_90px_70px_28px] gap-2 p-2 rounded-lg border bg-muted/20">
                  <div className="space-y-1">
                    <Input value={row.name} onChange={(e) => updateManual(i, "name", e.target.value)} placeholder="Item name" className="h-7 text-sm font-medium" autoFocus={i === 0} />
                    <Input value={row.description} onChange={(e) => updateManual(i, "description", e.target.value)} placeholder="Description (optional)" className="h-7 text-xs text-muted-foreground" />
                  </div>
                  <Input type="number" value={row.quantity} onChange={(e) => updateManual(i, "quantity", parseFloat(e.target.value) || 1)} className="h-7 text-sm text-center" />
                  <Input type="number" value={row.unit_price} onChange={(e) => updateManual(i, "unit_price", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                  <Input type="number" value={row.tax_rate} onChange={(e) => updateManual(i, "tax_rate", parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeManual(i)} disabled={manualRows.length === 1}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addManualRow}>
                <Plus className="w-3.5 h-3.5" />Add row
              </Button>
              <Button onClick={handleImportManual} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add {manualRows.filter((r) => r.name.trim()).length || 0} items to quote
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
