"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Send, Sparkles, ChevronDown, ChevronUp } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/customers/client-select";
import { AddressSelect } from "@/components/addresses/address-select";
import { createQuote, updateQuote, sendQuoteEmail, sendQuoteSms } from "@/lib/actions/quotes";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { LineItemsEditor } from "@/components/invoices/line-items-editor";
import { SmartFillModal } from "@/components/invoices/smart-fill-modal";
import type { SmartFillData } from "@/components/invoices/smart-fill-modal";
import { formatCurrency } from "@/lib/utils";
import { PdfSettingsPanel } from "@/components/pdf/pdf-settings-panel";
import type { Business, Customer, LineItem, Material, Product, Quote } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";
import { AiAssistButton } from "@/components/ai/ai-assist-button";
import { AiImageAnalyzer } from "@/components/ai/ai-image-analyzer";
import { DocumentPreviewPane } from "@/components/documents/document-preview-pane";
import { MyobDocumentShell, MyobHeaderBlock } from "@/components/ui/myob/myob-document-shell";
import { MyobField } from "@/components/ui/myob/myob-field";
import { MyobDateField } from "@/components/ui/myob/myob-date-field";
import { MyobTextarea } from "@/components/ui/myob/myob-input";
import { MyobAmount } from "@/components/ui/myob/myob-amount";

const schema = z.object({
  customer_id: z.string().optional(),
  issue_date: z.string().min(1),
  expiry_date: z.string().min(1),
  discount_type: z.enum(["percent", "fixed"]).optional(),
  discount_value: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  terms: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface QuoteEditorProps {
  customers: Customer[];
  products: Product[];
  materials?: Material[];
  business: Business;
  quote?: Quote & { customers?: Customer | null };
  defaultCustomerId?: string;
  onSaved?: (saved: Quote) => void;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function QuoteEditor({ customers, products, materials, business, quote, defaultCustomerId, onSaved }: QuoteEditorProps) {
  const router = useRouter();
  const currency = business.currency;
  const [lineItems, setLineItems] = useState<LineItem[]>((quote?.line_items as LineItem[]) ?? []);
  const [saving, setSaving] = useState(false);
  const [showImageAi, setShowImageAi] = useState(false);
  const [pdfSettings, setPdfSettings] = useState({ ...DEFAULT_PDF_SETTINGS, ...(business.pdf_settings ?? {}) });
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [siteId, setSiteId] = useState<string | null>(quote?.site_id ?? null);
  const [propertyAddress, setPropertyAddress] = useState<string>(quote?.property_address ?? "");
  const [sendOpen, setSendOpen] = useState(false);
  const [savedQuote, setSavedQuote] = useState<Quote | null>(quote ?? null);
  const [templateId, setTemplateId] = useState<string | null>(quote?.template_id ?? null);

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: quote?.customer_id ?? defaultCustomerId ?? "",
      issue_date: quote?.issue_date ?? new Date().toISOString().split("T")[0],
      expiry_date: quote?.expiry_date ?? addDays(30),
      discount_type: quote?.discount_type ?? undefined,
      discount_value: quote?.discount_value ?? 0,
      notes: quote?.notes ?? business.default_notes ?? "",
      terms: quote?.terms ?? business.default_quote_terms ?? business.payment_terms ?? "",
    },
  });

  const handleSmartFill = (data: SmartFillData) => {
    if (data.customer_id) setValue("customer_id", data.customer_id);
    if (data.newCustomer) setLocalCustomers((prev) => [...prev, data.newCustomer!]);
    if (data.issue_date) setValue("issue_date", data.issue_date);
    if (data.expiry_date) setValue("expiry_date", data.expiry_date);
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

  const onSubmit = async (data: FormData, status: Quote["status"] = "draft"): Promise<Quote | null> => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        customer_id: data.customer_id || null,
        line_items: lineItems as unknown as LineItem[],
        subtotal, discount_type: data.discount_type ?? null,
        discount_value: data.discount_value ?? 0, discount_amount: discountAmount,
        tax_total: taxTotal, total, status,
        issue_date: data.issue_date, expiry_date: data.expiry_date,
        notes: data.notes ?? null, terms: data.terms ?? null,
        invoice_id: quote?.invoice_id ?? null,
        site_id: siteId,
        property_address: propertyAddress || null,
        template_id: templateId,
      };

      if (quote) {
        const updated = await updateQuote(quote.id, payload);
        return updated;
      } else {
        const created = await createQuote(payload);
        return created;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally { setSaving(false); }
  };

  const handleSaveDraft = handleSubmit(async (d) => {
    const saved = await onSubmit(d, "draft");
    if (saved) {
      toast.success("Quote saved");
      if (onSaved) onSaved(saved);
      else router.push(`/quotes/${saved.id}`);
    }
  });

  const handleSaveAndSend = handleSubmit(async (d) => {
    if (!d.customer_id) { toast.error("Select a customer before sending"); return; }
    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    const saved = await onSubmit(d, quote?.status ?? "draft");
    if (saved) {
      setSavedQuote(saved);
      setSendOpen(true);
    }
  });

  const selectedCustomer = localCustomers.find((c) => c.id === watch("customer_id")) ?? null;

  const fv = watch();
  const previewDraft = {
    number: quote?.number ?? "PREVIEW",
    status: quote?.status ?? "draft",
    issue_date: fv.issue_date,
    expiry_date: fv.expiry_date,
    line_items: lineItems,
    subtotal,
    discount_type: fv.discount_type ?? null,
    discount_value: fv.discount_value ?? 0,
    discount_amount: discountAmount,
    tax_total: taxTotal,
    total,
    notes: fv.notes ?? null,
    terms: fv.terms ?? null,
    property_address: propertyAddress || null,
  };

  const actions = (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSmartFillOpen(true)}>
        <Sparkles className="w-3.5 h-3.5 text-purple-500" />Smart fill
      </Button>
      <PdfSettingsPanel settings={pdfSettings} business={business} mode="quote" onSettingsChange={setPdfSettings} />
      <Button variant="outline" size="sm" disabled={saving} onClick={handleSaveDraft}>
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}Save draft
      </Button>
      <Button size="sm" disabled={saving} onClick={handleSaveAndSend}>
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}Save &amp; send
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
      title={quote ? `Edit ${quote.number}` : "New quote"}
      backHref="/quotes"
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
              <MyobField label="Expiry date">
                <MyobDateField value={watch("expiry_date")} onChange={(v) => setValue("expiry_date", v)} />
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
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Discount" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  <SelectItem value="percent">% discount</SelectItem>
                  <SelectItem value="fixed">Fixed discount</SelectItem>
                </SelectContent>
              </Select>
              {discountType && <Input type="number" min="0" step="0.01" className="h-8 w-24 text-xs" {...register("discount_value")} />}
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
          </div>
        </div>

        {/* Notes / scope */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MyobField
              label="Notes / Scope of Works"
              labelAction={<AiAssistButton value={watch("notes") ?? ""} onResult={(text) => setValue("notes", text)} />}
            >
              <MyobTextarea rows={4} placeholder="Describe the scope of works..." {...register("notes")} />
            </MyobField>
            <MyobField label="Terms">
              <MyobTextarea rows={4} {...register("terms")} />
            </MyobField>
          </div>

          <div className="border-t pt-3">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-purple-500 transition-colors hover:text-purple-600"
              onClick={() => setShowImageAi((v) => !v)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate scope from site photos
              {showImageAi ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showImageAi && (
              <div className="mt-3">
                <AiImageAnalyzer
                  onResult={(text) => {
                    setValue("notes", text);
                    setShowImageAi(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </form>

      {savedQuote && (
        <SendDocumentModal
          open={sendOpen}
          onOpenChange={setSendOpen}
          docType="Quote"
          docNumber={savedQuote.number}
          defaultEmails={selectedCustomer?.email ? [selectedCustomer.email] : []}
          defaultPhone={selectedCustomer?.phone ?? ""}
          defaultSubject={`Quote ${savedQuote.number} from ${business.name}`}
          defaultSmsBody={`Hi${selectedCustomer?.name ? " " + selectedCustomer.name.split(" ")[0] : ""}, your quote ${savedQuote.number} from ${business.name} is ready.`}
          onSend={async (r) => {
            if (r.channel === "email") {
              await sendQuoteEmail(savedQuote.id, { recipients: r.recipients, subject: r.subject });
              toast.success(`Quote sent to ${(r.recipients ?? []).join(", ")}`);
            } else {
              await sendQuoteSms(savedQuote.id, { to: r.to!, body: r.body });
              toast.success(`Quote SMS sent to ${r.to}`);
            }
            router.push(`/quotes/${savedQuote.id}`);
          }}
        />
      )}

      <DocumentPreviewPane
        docType="quote"
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
        mode="quote"
        defaultTaxRate={10}
        currency={business.currency}
        preselectedCustomerId={watch("customer_id") || null}
      />
    </MyobDocumentShell>
  );
}
