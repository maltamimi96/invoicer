"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send, Download, Sparkles } from "lucide-react";
import { AiAssistButton } from "@/components/ai/ai-assist-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createInvoice, updateInvoice } from "@/lib/actions/invoices";
import { LineItemsEditor } from "./line-items-editor";
import { SmartFillModal } from "./smart-fill-modal";
import type { SmartFillData } from "./smart-fill-modal";
import { formatCurrency } from "@/lib/utils";
import { ClientSelect } from "@/components/customers/client-select";
import { PdfSettingsPanel } from "@/components/pdf/pdf-settings-panel";
import type { Business, Customer, Invoice, LineItem, Product } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";
import Link from "next/link";

const schema = z.object({
  customer_id: z.string().optional(),
  issue_date: z.string().min(1),
  due_date: z.string().min(1),
  discount_type: z.enum(["percent", "fixed"]).optional(),
  discount_value: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  terms: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface InvoiceEditorProps {
  customers: Customer[];
  products: Product[];
  business: Business;
  invoice?: Invoice & { customers?: Customer | null; payments?: unknown[] };
  defaultCustomerId?: string;
  mode?: "invoice" | "quote";
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function InvoiceEditor({ customers, products, business, invoice, defaultCustomerId }: InvoiceEditorProps) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItem[]>((invoice?.line_items as LineItem[]) ?? []);
  const [saving, setSaving] = useState(false);
  const [sendAfterSave, setSendAfterSave] = useState(false);
  const [pdfSettings, setPdfSettings] = useState({ ...DEFAULT_PDF_SETTINGS, ...(business.pdf_settings ?? {}) });
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: invoice?.customer_id ?? defaultCustomerId ?? "",
      issue_date: invoice?.issue_date ?? new Date().toISOString().split("T")[0],
      due_date: invoice?.due_date ?? addDays(30),
      discount_type: invoice?.discount_type ?? undefined,
      discount_value: invoice?.discount_value ?? 0,
      notes: invoice?.notes ?? business.default_notes ?? "",
      terms: invoice?.terms ?? business.payment_terms ?? "",
    },
  });

  const handleSmartFill = (data: SmartFillData) => {
    if (data.customer_id) setValue("customer_id", data.customer_id);
    if (data.newCustomer) setLocalCustomers((prev) => [...prev, data.newCustomer!]);
    if (data.issue_date) setValue("issue_date", data.issue_date);
    if (data.due_date) setValue("due_date", data.due_date);
    if (data.lineItems.length > 0) setLineItems(data.lineItems);
    setValue("notes", data.notes);
    setValue("terms", data.terms);
    if (data.discount_type) setValue("discount_type", data.discount_type);
    setValue("discount_value", data.discount_value);
  };

  const discountType = watch("discount_type");
  const discountValue = watch("discount_value") ?? 0;

  const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = discountType === "percent" ? (subtotal * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const taxTotal = lineItems.reduce((s, i) => {
    const lineDiscount = discountType === "percent" ? (i.subtotal * discountValue) / 100 : subtotal > 0 ? (discountAmount * i.subtotal / subtotal) : 0;
    return s + ((i.subtotal - lineDiscount) * i.tax_rate) / 100;
  }, 0);
  const total = subtotal - discountAmount + taxTotal;

  const onSubmit = async (data: FormData, sendStatus?: "sent") => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        customer_id: data.customer_id || null,
        line_items: lineItems as unknown as LineItem[],
        subtotal,
        discount_type: data.discount_type ?? null,
        discount_value: data.discount_value ?? 0,
        discount_amount: discountAmount,
        tax_total: taxTotal,
        total,
        amount_paid: invoice?.amount_paid ?? 0,
        status: (sendStatus ?? invoice?.status ?? "draft") as Invoice["status"],
        issue_date: data.issue_date,
        due_date: data.due_date,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
      };

      if (invoice) {
        await updateInvoice(invoice.id, payload);
        toast.success(sendStatus === "sent" ? "Invoice sent!" : "Invoice saved");
        router.push(`/invoices/${invoice.id}`);
      } else {
        const newInvoice = await createInvoice(payload);
        toast.success(sendStatus === "sent" ? "Invoice created & sent!" : "Invoice created");
        router.push(`/invoices/${newInvoice.id}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{invoice ? `Edit ${invoice.number}` : "New Invoice"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSmartFillOpen(true)}>
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />Smart fill
          </Button>
          <PdfSettingsPanel settings={pdfSettings} business={business} mode="invoice" onSettingsChange={setPdfSettings} />
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleSubmit((data) => onSubmit(data))}
          >
            {saving && !sendAfterSave ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save draft
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => { setSendAfterSave(true); handleSubmit((data) => onSubmit(data, "sent"))(); }}
          >
            {saving && sendAfterSave ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Save & send
          </Button>
        </div>
      </motion.div>

      <form className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice details */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Invoice Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Client</Label>
                  <ClientSelect
                    customers={localCustomers}
                    value={watch("customer_id") ?? ""}
                    onValueChange={(v) => setValue("customer_id", v === "none" ? "" : v)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Issue date</Label>
                    <Input type="date" {...register("issue_date")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due date</Label>
                    <Input type="date" {...register("due_date")} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Line Items</h3>
              <LineItemsEditor items={lineItems} products={products} onChange={setLineItems} currency={business.currency} />

              <Separator />

              {/* Totals */}
              <div className="space-y-2 ml-auto max-w-xs">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal, business.currency)}</span>
                </div>
                {/* Discount */}
                <div className="flex items-center gap-2">
                  <Select value={discountType ?? "none"} onValueChange={(v) => setValue("discount_type", v === "none" ? undefined : v as "percent" | "fixed")}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Discount" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No discount</SelectItem>
                      <SelectItem value="percent">% discount</SelectItem>
                      <SelectItem value="fixed">Fixed discount</SelectItem>
                    </SelectContent>
                  </Select>
                  {discountType && (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-7 text-xs w-24"
                      {...register("discount_value")}
                    />
                  )}
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Discount</span>
                    <span>- {formatCurrency(discountAmount, business.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(taxTotal, business.currency)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(total, business.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Notes to client</Label>
                    <AiAssistButton
                      value={watch("notes") ?? ""}
                      onResult={(text) => setValue("notes", text)}
                    />
                  </div>
                  <Textarea placeholder="Thank you for your business..." rows={3} {...register("notes")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment terms</Label>
                  <Textarea placeholder="Payment due within 30 days..." rows={3} {...register("terms")} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{lineItems.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal, business.currency)}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>- {formatCurrency(discountAmount, business.currency)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(taxTotal, business.currency)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(total, business.currency)}</span></div>
              </div>
            </CardContent>
          </Card>

          {business.bank_account_name && (
            <Card>
              <CardContent className="p-5 space-y-2">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Payment details</h3>
                <div className="text-xs space-y-1 text-muted-foreground">
                  {business.bank_name && <p>{business.bank_name}</p>}
                  {business.bank_account_name && <p>Name: {business.bank_account_name}</p>}
                  {business.bank_account_number && <p>Account: {business.bank_account_number}</p>}
                  {business.bank_sort_code && <p>Sort code: {business.bank_sort_code}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </form>

      <SmartFillModal
        open={smartFillOpen}
        onOpenChange={setSmartFillOpen}
        onFill={handleSmartFill}
        customers={localCustomers}
        mode="invoice"
        defaultTaxRate={10}
        currency={business.currency}
      />
    </div>
  );
}
