"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Save, Send, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSelect } from "@/components/customers/client-select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createQuote, updateQuote } from "@/lib/actions/quotes";
import { LineItemsEditor } from "@/components/invoices/line-items-editor";
import { SmartFillModal } from "@/components/invoices/smart-fill-modal";
import type { SmartFillData } from "@/components/invoices/smart-fill-modal";
import { formatCurrency } from "@/lib/utils";
import { PdfSettingsPanel } from "@/components/pdf/pdf-settings-panel";
import type { Business, Customer, LineItem, Product, Quote } from "@/types/database";
import { DEFAULT_PDF_SETTINGS } from "@/types/database";
import Link from "next/link";
import { AiAssistButton } from "@/components/ai/ai-assist-button";
import { AiImageAnalyzer } from "@/components/ai/ai-image-analyzer";

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
  business: Business;
  quote?: Quote & { customers?: Customer | null };
  defaultCustomerId?: string;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function QuoteEditor({ customers, products, business, quote, defaultCustomerId }: QuoteEditorProps) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItem[]>((quote?.line_items as LineItem[]) ?? []);
  const [saving, setSaving] = useState(false);
  const [showImageAi, setShowImageAi] = useState(false);
  const [pdfSettings, setPdfSettings] = useState({ ...DEFAULT_PDF_SETTINGS, ...(business.pdf_settings ?? {}) });
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);

  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: quote?.customer_id ?? defaultCustomerId ?? "",
      issue_date: quote?.issue_date ?? new Date().toISOString().split("T")[0],
      expiry_date: quote?.expiry_date ?? addDays(30),
      discount_type: quote?.discount_type ?? undefined,
      discount_value: quote?.discount_value ?? 0,
      notes: quote?.notes ?? business.default_notes ?? "",
      terms: quote?.terms ?? business.payment_terms ?? "",
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

  const onSubmit = async (data: FormData, status: Quote["status"] = "draft") => {
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
      };

      if (quote) {
        await updateQuote(quote.id, payload);
        toast.success("Quote saved");
        router.push(`/quotes/${quote.id}`);
      } else {
        const newQuote = await createQuote(payload);
        toast.success(status === "sent" ? "Quote created & sent!" : "Quote created");
        router.push(`/quotes/${newQuote.id}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-4">
          <Link href="/quotes"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div className="flex-1 min-w-0"><h1 className="text-2xl font-bold truncate">{quote ? `Edit ${quote.number}` : "New Quote"}</h1></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:ml-auto">
          <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-initial" onClick={() => setSmartFillOpen(true)}>
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />Smart fill
          </Button>
          <PdfSettingsPanel settings={pdfSettings} business={business} mode="quote" onSettingsChange={setPdfSettings} />
          <Button variant="outline" size="sm" className="flex-1 sm:flex-initial" disabled={saving} onClick={handleSubmit((d) => onSubmit(d, "draft"))}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}Save draft
          </Button>
          <Button size="sm" className="flex-1 sm:flex-initial" disabled={saving} onClick={handleSubmit((d) => onSubmit(d, "sent"))}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}Save & send
          </Button>
        </div>
      </motion.div>

      <form className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Quote Details</h3>
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
                  <div className="space-y-1.5"><Label>Issue date</Label><Input type="date" {...register("issue_date")} /></div>
                  <div className="space-y-1.5"><Label>Expiry date</Label><Input type="date" {...register("expiry_date")} /></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Line Items</h3>
              <LineItemsEditor items={lineItems} products={products} onChange={setLineItems} currency={business.currency} />
              <Separator />
              <div className="space-y-2 ml-auto max-w-xs">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal, business.currency)}</span></div>
                <div className="flex items-center gap-2">
                  <Select value={discountType ?? "none"} onValueChange={(v) => setValue("discount_type", v === "none" ? undefined : v as "percent" | "fixed")}>
                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Discount" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No discount</SelectItem>
                      <SelectItem value="percent">% discount</SelectItem>
                      <SelectItem value="fixed">Fixed discount</SelectItem>
                    </SelectContent>
                  </Select>
                  {discountType && <Input type="number" min="0" step="0.01" className="h-7 text-xs w-24" {...register("discount_value")} />}
                </div>
                {discountAmount > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Discount</span><span>- {formatCurrency(discountAmount, business.currency)}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(taxTotal, business.currency)}</span></div>
                <Separator />
                <div className="flex justify-between font-semibold"><span>Total</span><span className="text-lg">{formatCurrency(total, business.currency)}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Notes / Scope of Works</Label>
                    <AiAssistButton
                      value={watch("notes") ?? ""}
                      onResult={(text) => setValue("notes", text)}
                    />
                  </div>
                  <Textarea rows={4} placeholder="Describe the scope of works..." {...register("notes")} />
                </div>
                <div className="space-y-1.5"><Label>Terms</Label><Textarea rows={4} {...register("terms")} /></div>
              </div>

              <div className="border-t pt-3">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-600 transition-colors font-medium"
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
            </CardContent>
          </Card>
        </div>

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
        </div>
      </form>

      <SmartFillModal
        open={smartFillOpen}
        onOpenChange={setSmartFillOpen}
        onFill={handleSmartFill}
        customers={localCustomers}
        mode="quote"
        defaultTaxRate={10}
        currency={business.currency}
      />
    </div>
  );
}
