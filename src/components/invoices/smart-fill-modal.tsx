"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle, UserPlus, User } from "@/components/ui/icons";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { createCustomer } from "@/lib/actions/customers";
import { formatCurrency } from "@/lib/utils";
import type { Customer, LineItem } from "@/types/database";

interface SmartFillResult {
  existing_customer_id: string | null;
  new_customer: {
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    country?: string | null;
  } | null;
  issue_date: string | null;
  due_date?: string | null;
  expiry_date?: string | null;
  line_items: Array<{
    name: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }>;
  notes: string;
  terms: string;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
}

export interface SmartFillData {
  customer_id: string;
  newCustomer: Customer | null;
  issue_date: string | null;
  due_date: string | null;
  expiry_date: string | null;
  lineItems: LineItem[];
  notes: string;
  terms: string;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
}

interface SmartFillModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFill: (data: SmartFillData) => void;
  customers: Customer[];
  mode: "invoice" | "quote";
  defaultTaxRate?: number;
  currency?: string;
}

function calcItem(raw: Omit<LineItem, "subtotal" | "tax_amount" | "total">): LineItem {
  const subtotal = raw.quantity * raw.unit_price * (1 - raw.discount_percent / 100);
  const tax_amount = (subtotal * raw.tax_rate) / 100;
  return { ...raw, subtotal, tax_amount, total: subtotal + tax_amount };
}

export function SmartFillModal({
  open,
  onOpenChange,
  onFill,
  customers,
  mode,
  defaultTaxRate = 10,
  currency = "AUD",
}: SmartFillModalProps) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<SmartFillResult | null>(null);

  const handleParse = async () => {
    if (!text.trim()) { toast.error("Paste some text first"); return; }
    setParsing(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "smart_fill_document",
          text,
          mode,
          customers: customers.map((c) => ({ id: c.id, name: c.name, company: c.company, email: c.email })),
          defaultTaxRate,
          today: new Date().toISOString().split("T")[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data.result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      let customerId = result.existing_customer_id ?? "";
      let newCustomer: Customer | null = null;

      if (!customerId && result.new_customer?.name) {
        newCustomer = await createCustomer({
          name: result.new_customer.name,
          company: result.new_customer.company ?? null,
          email: result.new_customer.email ?? null,
          phone: result.new_customer.phone ?? null,
          address: result.new_customer.address ?? null,
          city: result.new_customer.city ?? null,
          postcode: result.new_customer.postcode ?? null,
          country: result.new_customer.country ?? null,
          tax_number: null,
          notes: null,
          archived: false,
        });
        customerId = newCustomer.id;
      }

      const lineItems = result.line_items.map((item) =>
        calcItem({
          id: uuidv4(),
          name: item.name,
          description: item.description ?? "",
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: 0,
        })
      );

      onFill({
        customer_id: customerId,
        newCustomer,
        issue_date: result.issue_date,
        due_date: result.due_date ?? null,
        expiry_date: result.expiry_date ?? null,
        lineItems,
        notes: result.notes ?? "",
        terms: result.terms ?? "",
        discount_type: result.discount_type ?? null,
        discount_value: result.discount_value ?? 0,
      });

      setText("");
      setResult(null);
      onOpenChange(false);
      toast.success("Form filled from pasted text");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const exTaxTotal = result
    ? result.line_items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    : 0;

  const matchedCustomer = result?.existing_customer_id
    ? customers.find((c) => c.id === result.existing_customer_id)
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setText(""); setResult(null); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Smart Fill
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-y-auto">
          {!result ? (
            <>
              <div className="space-y-2">
                <Label>Paste anything</Label>
                <p className="text-xs text-muted-foreground">
                  Paste a quote, email, Gemini response, spreadsheet data — Claude will extract the client, dates, line items, and notes and fill the entire form.
                </p>
                <Textarea
                  placeholder={`Examples:\n\nQuote for John Smith at ABC Constructions\nRoof replacement at 42 Sample St, Sydney\n\n- Labour: 16 hours @ $95/hr\n- Colorbond roofing sheets: 120sqm @ $38/sqm\n- Removal & disposal: $450\n\nValid for 30 days. Payment due within 14 days.`}
                  rows={12}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="font-mono text-sm resize-none"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleParse} disabled={parsing || !text.trim()} className="gap-1.5">
                  {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {parsing ? "Analysing..." : "Analyse & preview"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Preview */}
              <div className="space-y-4">
                {/* Client */}
                <div className="rounded-lg border p-4 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client</p>
                  {matchedCustomer ? (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{matchedCustomer.name}</p>
                        {matchedCustomer.company && <p className="text-xs text-muted-foreground">{matchedCustomer.company}</p>}
                      </div>
                      <Badge variant="secondary" className="ml-auto text-xs">Existing client</Badge>
                    </div>
                  ) : result.new_customer ? (
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{result.new_customer.name}</p>
                        {result.new_customer.company && <p className="text-xs text-muted-foreground">{result.new_customer.company}</p>}
                        {result.new_customer.email && <p className="text-xs text-muted-foreground">{result.new_customer.email}</p>}
                        {result.new_customer.phone && <p className="text-xs text-muted-foreground">{result.new_customer.phone}</p>}
                      </div>
                      <Badge className="ml-auto text-xs bg-blue-500">New client</Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No client detected</p>
                  )}
                </div>

                {/* Dates */}
                <div className="rounded-lg border p-4 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dates</p>
                  <div className="flex gap-6 text-sm">
                    {result.issue_date && (
                      <div><span className="text-muted-foreground">Issue: </span><span>{result.issue_date}</span></div>
                    )}
                    {(mode === "invoice" ? result.due_date : result.expiry_date) && (
                      <div>
                        <span className="text-muted-foreground">{mode === "invoice" ? "Due: " : "Expiry: "}</span>
                        <span>{mode === "invoice" ? result.due_date : result.expiry_date}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line items */}
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Line Items ({result.line_items.length})
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {result.line_items.map((item, i) => (
                      <div key={i} className="flex items-start justify-between text-sm gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                        </div>
                        <div className="text-right flex-shrink-0 text-muted-foreground text-xs">
                          <p>{item.quantity} × {formatCurrency(item.unit_price, currency)}</p>
                          <p>{formatCurrency(item.quantity * item.unit_price, currency)} ex tax</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total ex tax</span>
                    <span>{formatCurrency(exTaxTotal, currency)}</span>
                  </div>
                </div>

                {/* Notes */}
                {result.notes && (
                  <div className="rounded-lg border p-4 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                    <p className="text-sm text-muted-foreground line-clamp-3">{result.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setResult(null)}>
                  ← Back to paste
                </Button>
                <Button onClick={handleApply} disabled={applying} className="gap-1.5">
                  {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {applying ? "Applying..." : "Fill form"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
