"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send, Sparkles } from "lucide-react";
import { AiAssistButton } from "@/components/ai/ai-assist-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createInvoice, updateInvoice, sendInvoiceEmail, sendInvoiceSms } from "@/lib/actions/invoices";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { LineItemsEditor } from "./line-items-editor";
import { SmartFillModal } from "./smart-fill-modal";
import type { SmartFillData } from "./smart-fill-modal";
import { formatCurrency } from "@/lib/utils";
import { ClientSelect } from "@/components/customers/client-select";
import { AddressSelect } from "@/components/addresses/address-select";
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
  const [pdfSettings, setPdfSettings] = useState({ ...DEFAULT_PDF_SETTINGS, ...(business.pdf_settings ?? {}) });
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [siteId, setSiteId] = useState<string | null>(invoice?.site_id ?? null);
  const [propertyAddress, setPropertyAddress] = useState<string>(invoice?.property_address ?? "");
  const [sendOpen, setSendOpen] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(invoice ?? null);

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
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

  const onSubmit = async (data: FormData): Promise<Invoice | null> => {
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
        status: (invoice?.status ?? "draft") as Invoice["status"],
        issue_date: data.issue_date,
        due_date: data.due_date,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        site_id: siteId,
        property_address: propertyAddress || null,
      };

      if (invoice) {
        const updated = await updateInvoice(invoice.id, payload);
        return updated;
      } else {
        return await createInvoice(payload);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = handleSubmit(async (d) => {
    const saved = await onSubmit(d);
    if (saved) {
      toast.success("Invoice saved");
      router.push(`/invoices/${saved.id}`);
    }
  });

  const handleSaveAndSend = handleSubmit(async (d) => {
    if (!d.customer_id) { toast.error("Select a customer before sending"); return; }
    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    const saved = await onSubmit(d);
    if (saved) {
      setSavedInvoice(saved);
      setSendOpen(true);
    }
  });

  const selectedCustomer = localCustomers.find((c) => c.id === watch("customer_id")) ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-4">
          <Link href="/invoices">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{invoice ? `Edit ${invoice.number}` : "New Invoice"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:ml-auto">
          <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-initial" onClick={() => setSmartFillOpen(true)}>
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />Smart fill
          </Button>
          <PdfSettingsPanel settings={pdfSettings} business={business} mode="invoice" onSettingsChange={setPdfSettings} />
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial"
            disabled={saving}
            onClick={handleSaveDraft}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save draft
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-initial"
            disabled={saving}
            onClick={handleSaveAndSend}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
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
                    onCustomerCreated={(c) => setLocalCustomers((prev) => [...prev, c])}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <AddressSelect
                customer={localCustomers.find((c) => c.id === watch("customer_id")) ?? null}
                value={{ site_id: siteId, property_address: propertyAddress }}
                onChange={(v) => { setSiteId(v.site_id); setPropertyAddress(v.property_address); }}
              />
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

      {savedInvoice && (
        <SendDocumentModal
          open={sendOpen}
          onOpenChange={setSendOpen}
          docType="Invoice"
          docNumber={savedInvoice.number}
          defaultEmails={selectedCustomer?.email ? [selectedCustomer.email] : []}
          defaultPhone={selectedCustomer?.phone ?? ""}
          defaultSubject={`Invoice ${savedInvoice.number} from ${business.name}`}
          defaultSmsBody={`Hi${selectedCustomer?.name ? " " + selectedCustomer.name.split(" ")[0] : ""}, your invoice ${savedInvoice.number} from ${business.name} is ready.`}
          onSend={async (r) => {
            if (r.channel === "email") {
              await sendInvoiceEmail(savedInvoice.id, { recipients: r.recipients, subject: r.subject });
              toast.success(`Invoice sent to ${(r.recipients ?? []).join(", ")}`);
            } else {
              await sendInvoiceSms(savedInvoice.id, { to: r.to!, body: r.body });
              toast.success(`Invoice SMS sent to ${r.to}`);
            }
            router.push(`/invoices/${savedInvoice.id}`);
          }}
        />
      )}

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
