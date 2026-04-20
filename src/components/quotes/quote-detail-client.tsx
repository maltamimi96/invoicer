"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Edit, Trash2, ArrowRight, MoreHorizontal, Send } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteQuote, updateQuote, convertQuoteToInvoice, sendQuoteEmail, sendQuoteSms } from "@/lib/actions/quotes";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { QuoteEditor } from "./quote-editor";
import { QuotePDFDownload } from "./quote-pdf";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import type { Business, Customer, LineItem, Product, Quote } from "@/types/database";

interface QuoteDetailClientProps {
  quote: Quote & { customers?: Customer | null };
  customers: Customer[];
  products: Product[];
  business: Business;
}

export function QuoteDetailClient({ quote: initial, customers, products, business }: QuoteDetailClientProps) {
  const router = useRouter();
  const [quote, setQuote] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

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

  if (editing) return <QuoteEditor customers={customers} products={products} business={business} quote={quote} />;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href="/quotes"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{quote.number}</h1>
            <Badge variant="secondary" className={getStatusColor(quote.status)}>{quote.status}</Badge>
            {quote.invoice_id && <Badge variant="outline" className="text-xs">Converted to invoice</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{customer?.name ?? "No client"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!quote.invoice_id && quote.status !== "rejected" && (
            <Button size="sm" className="gap-1.5" onClick={handleConvert} disabled={converting}>
              <ArrowRight className="w-3.5 h-3.5" />{converting ? "Converting..." : "Convert to invoice"}
            </Button>
          )}
          {quote.status !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setSendOpen(true)}
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          )}
          <QuotePDFDownload quoteId={quote.id} quoteNumber={quote.number} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
            <Edit className="w-3.5 h-3.5" />Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStatusChange("sent")}>Mark as sent</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("accepted")}>Mark as accepted</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("rejected")}>Mark as rejected</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive gap-2"><Trash2 className="w-3.5 h-3.5" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

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

        <div>
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Quote info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary" className={getStatusColor(quote.status)}>{quote.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">{formatCurrency(quote.total, business.currency)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{formatDate(quote.expiry_date)}</span></div>
                {quote.invoice_id && (
                  <div className="pt-2">
                    <Link href={`/invoices/${quote.invoice_id}`}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                        <ArrowRight className="w-3 h-3" />View invoice
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
            await sendQuoteEmail(quote.id, { recipients: r.recipients, subject: r.subject });
            toast.success(`Quote sent to ${(r.recipients ?? []).join(", ")}`);
          } else {
            await sendQuoteSms(quote.id, { to: r.to!, body: r.body });
            toast.success(`Quote SMS sent to ${r.to}`);
          }
          setQuote((prev) => ({ ...prev, status: prev.status === "draft" ? "sent" : prev.status }));
        }}
      />

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
