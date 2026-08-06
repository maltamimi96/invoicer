"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, ArrowRight, MoreHorizontal, Send, Copy, Link2, FileCheck, Calendar, DollarSign } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteQuote, updateQuote, convertQuoteToInvoice, sendQuoteEmail, sendQuoteSms, duplicateQuote } from "@/lib/actions/quotes";
import { ShareWithCustomerDialog } from "@/components/share/share-with-customer-dialog";
import { DeliveryStatusCard } from "@/components/delivery/delivery-status-card";
import { ScheduledSendsCard } from "@/components/delivery/scheduled-sends-card";
import { scheduleSend } from "@/lib/actions/scheduled-sends";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { QuoteEditor } from "./quote-editor";
import { QuotePDFDownload } from "./quote-pdf";
import { TemplatePicker } from "@/components/documents/template-picker";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  DetailHero, FactCard, AnimatedPress, FadeIn,
} from "@/components/ui/kirei";
import type { GradientName } from "@/components/ui/kirei";
import type { Business, Customer, LineItem, Material, Product, Quote } from "@/types/database";

const STATUS_GRADIENT: Record<string, GradientName> = {
  accepted: "emerald",
  sent:     "blue",
  rejected: "rose",
  expired:  "rose",
  draft:    "violet",
};

interface QuoteDetailClientProps {
  quote: Quote & { customers?: Customer | null };
  customers: Customer[];
  products: Product[];
  materials?: Material[];
  business: Business;
}

export function QuoteDetailClient({ quote: initial, customers, products, materials, business }: QuoteDetailClientProps) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleDuplicate = async () => {
    try {
      const dup = await duplicateQuote(quote.id);
      toast.success("Quote duplicated");
      router.push(`/quotes/${dup.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't duplicate"); }
  };

  const lineItems = (quote.line_items ?? []) as LineItem[];
  const customer = customers.find((c) => c.id === quote.customer_id);

  const handleStatusChange = async (status: Quote["status"]) => {
    try {
      const updated = await updateQuote(quote.id, { status });
      setQuote((prev) => ({ ...prev, ...updated }));
      toast.success(`Quote marked as ${status}`);
    } catch { toast.error("Failed to update"); }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const invoice = await convertQuoteToInvoice(quote.id);
      toast.success("Converted to invoice!");
      router.push(`/invoices/${invoice.id}`);
    } catch { toast.error("Conversion failed"); setConverting(false); }
  };

  const handleDelete = async () => {
    try {
      await deleteQuote(quote.id);
      toast.success("Quote deleted");
      router.push("/quotes");
    } catch { toast.error("Failed to delete"); }
  };

  if (editing) return (
    <QuoteEditor
      customers={customers}
      products={products}
      materials={materials}
      business={business}
      quote={quote}
      onSaved={(saved) => {
        setQuote((prev) => ({ ...prev, ...saved } as typeof prev));
        setEditing(false);
        router.refresh();
      }}
    />
  );

  return (
    <div className="space-y-6">
      <DetailHero
        backHref="/quotes"
        eyebrow={quote.number}
        title={customer?.name ?? "No client"}
        gradient={STATUS_GRADIENT[quote.status] ?? "violet"}
        icon={<FileCheck className="w-6 h-6" />}
        status={quote.status}
        subtitle={quote.invoice_id ? "Converted to invoice" : `Issued ${formatDate(quote.issue_date)} · Expires ${formatDate(quote.expiry_date)}`}
        actions={
          <>
            {!quote.invoice_id && quote.status !== "rejected" && (
              <AnimatedPress
                onClick={handleConvert}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer ${converting ? "opacity-60" : ""}`}
              >
                <ArrowRight className="w-4 h-4" />{converting ? "Converting…" : "Convert to invoice"}
              </AnimatedPress>
            )}
            {quote.status !== "rejected" && (
              <AnimatedPress
                onClick={() => setSendOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
              >
                <Send className="w-4 h-4" /> Send
              </AnimatedPress>
            )}
            {quote.customer_id && (
              <AnimatedPress
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
              >
                <Link2 className="w-4 h-4" /> Share
              </AnimatedPress>
            )}
            <TemplatePicker docType="quote" docId={quote.id} currentTemplateId={quote.template_id} />
            <QuotePDFDownload quoteId={quote.id} quoteNumber={quote.number} />
            <AnimatedPress
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
            >
              <Edit className="w-4 h-4" /> Edit
            </AnimatedPress>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl"><MoreHorizontal className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleStatusChange("draft")}>Reset to draft</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("sent")}>Mark as sent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("accepted")}>Mark as accepted</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("rejected")}>Mark as rejected</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("expired")}>Mark as expired</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDuplicate} className="gap-2"><Copy className="w-3.5 h-3.5" />Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive gap-2"><Trash2 className="w-3.5 h-3.5" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Fact strip */}
      <FadeIn delay={80}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FactCard gradient="emerald" icon={<DollarSign className="w-4 h-4" />} label="Total"    value={formatCurrency(quote.total, business.currency)} />
          <FactCard gradient="blue"    icon={<Calendar   className="w-4 h-4" />} label="Issued"   value={formatDate(quote.issue_date)} />
          <FactCard gradient="amber"   icon={<Calendar   className="w-4 h-4" />} label="Expires"  value={formatDate(quote.expiry_date)} />
          <FactCard gradient="violet"  icon={<FileCheck  className="w-4 h-4" />} label="Status"   value={<span className="capitalize">{quote.status}</span>} />
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between gap-6">
                <div>
                  <p className="font-bold text-lg">{business.name}</p>
                  {business.address && <p className="text-sm text-muted-foreground">{business.address}</p>}
                  {business.email && <p className="text-sm text-muted-foreground">{business.email}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-bold text-xl text-blue-600 dark:text-blue-400">QUOTE</p>
                  <p className="text-2xl font-bold mt-1">{quote.number}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Quote for</p>
                  {customer ? (
                    <>
                      <p className="font-medium">{customer.name}</p>
                      {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
                      {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
                    </>
                  ) : <p className="text-sm text-muted-foreground">No client</p>}
                </div>
                <div className="text-right space-y-2">
                  <div><p className="text-xs text-muted-foreground">Issue date</p><p className="font-medium text-sm">{formatDate(quote.issue_date)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Expiry date</p><p className="font-medium text-sm">{formatDate(quote.expiry_date)}</p></div>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-[1fr_60px_80px_60px_80px] gap-2 pb-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Description</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-center">Tax</span><span className="text-right">Total</span>
                </div>
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_60px_80px_60px_80px] gap-2 py-3 border-b border-dashed">
                    <div><p className="font-medium text-sm">{item.name}</p>{item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}</div>
                    <span className="text-center text-sm">{item.quantity}</span>
                    <span className="text-right text-sm">{formatCurrency(item.unit_price, business.currency)}</span>
                    <span className="text-center text-sm">{item.tax_rate}%</span>
                    <span className="text-right text-sm font-medium">{formatCurrency(item.total, business.currency)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal, business.currency)}</span></div>
                  {quote.discount_amount > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Discount</span><span>- {formatCurrency(quote.discount_amount, business.currency)}</span></div>}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(quote.tax_total, business.currency)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(quote.total, business.currency)}</span></div>
                </div>
              </div>

              {(quote.notes || quote.terms) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {quote.notes && <div><p className="font-medium mb-1">Notes</p><p className="text-muted-foreground">{quote.notes}</p></div>}
                    {quote.terms && <div><p className="font-medium mb-1">Terms</p><p className="text-muted-foreground">{quote.terms}</p></div>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <ScheduledSendsCard docType="quote" docId={quote.id} />
          <DeliveryStatusCard docType="quote" docId={quote.id} />
          {quote.invoice_id && (
            <Link href={`/invoices/${quote.invoice_id}`} className="block">
              <AnimatedPress className="flex items-center gap-3 p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">View invoice</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">Converted from this quote</p>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              </AnimatedPress>
            </Link>
          )}
        </div>
      </div>

      <SendDocumentModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        docType="Quote"
        docNumber={quote.number}
        defaultEmails={customer?.email ? [customer.email] : []}
        defaultPhone={customer?.phone ?? null}
        defaultSubject={`Quote ${quote.number} from ${business.name}`}
        defaultSmsBody={`Hi${customer?.name ? " " + customer.name.split(" ")[0] : ""}, your quote ${quote.number} from ${business.name} is ready.`}
        onSend={async (r) => {
          if (r.channel === "email") {
            await sendQuoteEmail(quote.id, { recipients: r.recipients, subject: r.subject, message: r.message });
            toast.success(`Quote sent to ${(r.recipients ?? []).join(", ")}`);
          } else {
            await sendQuoteSms(quote.id, { to: r.to!, body: r.body });
            toast.success(`Quote SMS sent to ${r.to}`);
          }
          setQuote((prev) => ({ ...prev, status: prev.status === "draft" ? "sent" : prev.status }));
        }}
        onSchedule={async (sendAtIso, r) => {
          await scheduleSend({
            doc_type: "quote",
            doc_id: quote.id,
            send_at: sendAtIso,
            channel: r.channel,
            recipients: r.recipients,
            to_phone: r.to,
            subject: r.subject,
            body: r.body,
          });
          toast.success(`Scheduled for ${new Date(sendAtIso).toLocaleString()}`);
          router.refresh();
        }}
      />

      {quote.customer_id && (
        <ShareWithCustomerDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          customerId={quote.customer_id}
          customerName={customer?.name ?? null}
          customerPhone={customer?.phone ?? null}
          docType="quote"
          docId={quote.id}
          docNumber={quote.number}
        />
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {quote.number}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
