"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Send, Sparkles } from "@/components/ui/icons";
import { AiAssistButton } from "@/components/ai/ai-assist-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInvoice, updateInvoice, sendInvoiceEmail, sendInvoiceSms } from "@/lib/actions/invoices";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { LineItemsEditor } from "./line-items-editor";
import { SmartFillModal } from "./smart-fill-modal";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import type { SmartFillData } from "./smart-fill-modal";
import { formatCurrency } from "@/lib/utils";
import { ClientSelect } from "@/components/customers/client-select";
import { AddressSelect } from "@/components/addresses/address-select";
import { PdfSettingsPanel } from "@/components/pdf/pdf-settings-panel";
import { MyobDocumentShell, MyobHeaderBlock } from "@/components/ui/myob/myob-document-shell";
import { MyobField } from "@/components/ui/myob/myob-field";
import { MyobDateField } from "@/components/ui/myob/myob-date-field";
import { MyobTextarea } from "@/components/ui/myob/myob-input";
import { MyobAmount } from "@/components/ui/myob/myob-amount";
import type { Business, Customer, Invoice, LineItem, Material, Product } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";

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
  materials?: Material[];
  business: Business;
  invoice?: Invoice & { customers?: Customer | null; payments?: unknown[] };
  defaultCustomerId?: string;
  mode?: "invoice" | "quote";
  /** Called after a successful save (draft or send). When provided, parent
   *  takes over post-save UX (e.g. exit edit mode + refresh detail) instead
   *  of the default router.push. */
  onSaved?: (saved: Invoice) => void;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function InvoiceEditor({ customers, products, materials, business, invoice, defaultCustomerId, onSaved }: InvoiceEditorProps) {
  const router = useRouter();
  const currency = business.currency;
  const [lineItems, setLineItems] = useState<LineItem[]>((invoice?.line_items as LineItem[]) ?? []);
  const [saving, setSaving] = useState(false);
  const [pdfSettings, setPdfSettings] = useState({ ...DEFAULT_PDF_SETTINGS, ...(business.pdf_settings ?? {}) });
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [siteId, setSiteId] = useState<string | null>(invoice?.site_id ?? null);
  const [propertyAddress, setPropertyAddress] = useState<string>(invoice?.property_address ?? "");
  const [sendOpen, setSendOpen] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(invoice ?? null);
  const [templateId, setTemplateId] = useState<string | null>(invoice?.template_id ?? null);

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: invoice?.customer_id ?? defaultCustomerId ?? "",
      issue_date: invoice?.issue_date ?? new Date().toISOString().split("T")[0],
      due_date: invoice?.due_date ?? addDays(30),
      discount_type: invoice?.discount_type ?? undefined,
      discount_value: invoice?.discount_value ?? 0,
      notes: invoice?.notes ?? business.default_notes ?? "",
      terms: invoice?.terms ?? business.default_invoice_terms ?? business.payment_terms ?? "",
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
  const amountPaid = invoice?.amount_paid ?? 0;

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
        template_id: templateId,
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
      if (onSaved) {
        onSaved(saved);
      } else {
        router.push(`/invoices/${saved.id}`);
      }
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

  const fv = watch();
  const previewDraft = {
    number: invoice?.number ?? "PREVIEW",
    status: invoice?.status ?? "draft",
    issue_date: fv.issue_date,
    due_date: fv.due_date,
    line_items: lineItems,
    subtotal,
    discount_type: fv.discount_type ?? null,
    discount_value: fv.discount_value ?? 0,
    discount_amount: discountAmount,
    tax_total: taxTotal,
    total,
    amount_paid: invoice?.amount_paid ?? 0,
    notes: fv.notes ?? null,
    terms: fv.terms ?? null,
    property_address: propertyAddress || null,
  };

  const actions = (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSmartFillOpen(true)}>
        <Sparkles className="w-3.5 h-3.5 text-purple-500" />Smart fill
      </Button>
      <PdfSettingsPanel settings={pdfSettings} business={business} mode="invoice" onSettingsChange={setPdfSettings} />
      <Button variant="outline" size="sm" disabled={saving} onClick={handleSaveDraft}>
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        Save draft
      </Button>
      <Button size="sm" disabled={saving} onClick={handleSaveAndSend}>
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
        Save &amp; send
      </Button>
    </>
  );

  const mobileActions = (
    <>
      <Button variant="outline" size="sm" className="flex-1" disabled={saving} onClick={handleSaveDraft}>Save draft</Button>
      <Button size="sm" className="flex-1" disabled={saving} onClick={handleSaveAndSend}>Save &amp; send</Button>
    </>
  );

  return (
    <MyobDocumentShell
      title={invoice ? `Edit ${invoice.number}` : "New invoice"}
      backHref="/invoices"
      actions={actions}
      mobileActions={mobileActions}
    >
      <form className="space-y-7">
        {/* Header block */}
        <MyobHeaderBlock
          left={
            <>
              <MyobField label="Client" noUnderline>
                <ClientSelect
                  className="h-11"
                  customers={localCustomers}
                  value={watch("customer_id") ?? ""}
                  onValueChange={(v) => setValue("customer_id", v === "none" ? "" : v)}
                  onCustomerCreated={(c) => setLocalCustomers((prev) => [...prev, c])}
                />
              </MyobField>
              <AddressSelect
                label="Site / address"
                customer={selectedCustomer}
                value={{ site_id: siteId, property_address: propertyAddress }}
                onChange={(v) => { setSiteId(v.site_id); setPropertyAddress(v.property_address); }}
              />
            </>
          }
          right={
            <>
              <MyobField label="Issue date">
                <MyobDateField value={watch("issue_date")} onChange={(v) => setValue("issue_date", v)} />
              </MyobField>
              <MyobField label="Due date">
                <MyobDateField value={watch("due_date")} onChange={(v) => setValue("due_date", v)} />
              </MyobField>
            </>
          }
        />

        {/* Line items + totals */}
        <div className="space-y-4">
          <LineItemsEditor items={lineItems} products={products} materials={materials} onChange={setLineItems} currency={currency} />

          <div className="h-px bg-border" />

          <div className="ml-auto w-full max-w-xs space-y-2">
            <div className="flex h-8 items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={discountType ?? "none"} onValueChange={(v) => setValue("discount_type", v === "none" ? undefined : v as "percent" | "fixed")}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder="Discount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  <SelectItem value="percent">% discount</SelectItem>
                  <SelectItem value="fixed">Fixed discount</SelectItem>
                </SelectContent>
              </Select>
              {discountType && (
                <Input type="number" min="0" step="0.01" className="h-8 w-24 text-xs" {...register("discount_value")} />
              )}
            </div>
            {discountAmount > 0 && (
              <div className="flex h-8 items-center justify-between text-sm text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums">- {formatCurrency(discountAmount, currency)}</span>
              </div>
            )}
            <div className="flex h-8 items-center justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatCurrency(taxTotal, currency)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between py-1">
              <span className="text-base font-semibold">Total</span>
              <MyobAmount value={total} currency={currency} className="text-base font-semibold tabular-nums" />
            </div>
            {amountPaid > 0 && (
              <>
                <div className="flex h-8 items-center justify-between text-sm text-muted-foreground">
                  <span>Amount paid</span>
                  <span className="tabular-nums">- {formatCurrency(amountPaid, currency)}</span>
                </div>
                <div className="flex h-8 items-center justify-between text-sm font-medium">
                  <span>Balance due</span>
                  <span className="tabular-nums">{formatCurrency(total - amountPaid, currency)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MyobField
            label="Notes to client"
            labelAction={<AiAssistButton value={watch("notes") ?? ""} onResult={(text) => setValue("notes", text)} />}
          >
            <MyobTextarea placeholder="Thank you for your business..." rows={3} {...register("notes")} />
          </MyobField>
          <MyobField label="Payment terms">
            <MyobTextarea placeholder="Payment due within 30 days..." rows={3} {...register("terms")} />
          </MyobField>
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

      <DocumentPreviewPane
        docType="invoice"
        templateId={templateId}
        onTemplateChange={setTemplateId}
        draft={previewDraft}
        customerId={fv.customer_id || null}
      />

      <SmartFillModal
        open={smartFillOpen}
        onOpenChange={setSmartFillOpen}
        onFill={handleSmartFill}
        customers={localCustomers}
        mode="invoice"
        defaultTaxRate={10}
        currency={business.currency}
        preselectedCustomerId={watch("customer_id") || null}
      />
    </MyobDocumentShell>
  );
}
