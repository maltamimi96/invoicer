"use client";

import { useConfirm } from "@/components/ui/confirm";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Send, Copy, Trash2, CheckCircle, DollarSign, MoreHorizontal, FileStack, ArrowRight, Link2, FileText, Calendar, CreditCard, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateInvoice, deleteInvoice, duplicateInvoice, addPayment, sendInvoiceEmail, sendInvoiceSms, createProgressInvoice } from "@/lib/actions/invoices";
import { chargeSavedCardNow } from "@/lib/actions/stripe";
import { SendDocumentModal } from "@/components/send/send-document-modal";
import { InvoiceEditor } from "./invoice-editor";
import { InvoicePDFDownload } from "./invoice-pdf";
import { ProgressInvoiceModal } from "./progress-invoice-modal";
import { DeliveryStatusCard } from "@/components/delivery/delivery-status-card";
import { ScheduledSendsCard } from "@/components/delivery/scheduled-sends-card";
import { scheduleSend } from "@/lib/actions/scheduled-sends";
import { ShareWithCustomerDialog } from "@/components/share/share-with-customer-dialog";

import { formatCurrency, formatDate, num } from "@/lib/utils";
import {
  DetailHero, FactCard, AnimatedPress, FadeIn, GradientTile, KireiPill, Confetti,
} from "@/components/ui/kirei";
import type { GradientName } from "@/components/ui/kirei";
import type { Business, Customer, Invoice, LineItem, Payment, Product } from "@/types/database";

const STATUS_GRADIENT: Record<string, GradientName> = {
  paid:      "emerald",
  partial:   "blue",
  sent:      "blue",
  overdue:   "rose",
  cancelled: "rose",
  draft:     "primary",
};

interface InvoiceDetailClientProps {
  invoice: Invoice & { customers?: Customer | null; payments?: Payment[] };
  customers: Customer[];
  products: Product[];
  business: Business;
  /** Children of THIS invoice if it's a parent, or siblings if this is itself a child. */
  progressInvoices?: Invoice[];
  /** Set when viewing a child — the invoice this one bills against. */
  parentInvoice?: Invoice | null;
}

export function InvoiceDetailClient({
  invoice: initial, customers, products, business,
  progressInvoices = [], parentInvoice = null,
}: InvoiceDetailClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [invoice, setInvoice] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(String((invoice.total - invoice.amount_paid).toFixed(2)));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  // Confetti — bump this counter whenever the invoice flips to paid so the
  // <Confetti /> at the bottom of the tree fires a new burst.
  const [confettiKey, setConfettiKey] = useState(0);

  const lineItems = (invoice.line_items ?? []) as LineItem[];
  const customer = customers.find((c) => c.id === invoice.customer_id);

  // For progress-invoice billing math: when this is a parent, compute how
  // much has been split into children already.
  const isChild  = !!invoice.parent_invoice_id;
  const isParent = !isChild && progressInvoices.length > 0;
  const billedSoFar      = progressInvoices.reduce((sum, c) => sum + Number(c.total ?? 0), 0);
  const depositsReceived = progressInvoices.reduce((sum, c) => sum + Number(c.amount_paid ?? 0), 0);
  const remaining        = Math.max(0, Number(invoice.total) - billedSoFar);
  // What the customer still owes across all linked invoices (parent + children).
  const balanceAfterDeposits = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0) - depositsReceived);

  const handleStatusChange = async (status: Invoice["status"]) => {
    const wasPaid = invoice.status === "paid";
    try {
      const updated = await updateInvoice(invoice.id, { status });
      setInvoice((prev) => ({ ...prev, ...updated }));
      toast.success(`Invoice marked as ${status}`);
      if (status === "paid" && !wasPaid) setConfettiKey((k) => k + 1);
    } catch { toast.error("Failed to update status"); }
  };

  const handleDuplicate = async () => {
    try {
      const newInv = await duplicateInvoice(invoice.id);
      toast.success("Invoice duplicated");
      router.push(`/invoices/${newInv.id}`);
    } catch { toast.error("Failed to duplicate"); }
  };

  const handleDelete = async () => {
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      router.push("/invoices");
    } catch { toast.error("Failed to delete"); }
  };

  const handleSendRemainder = async () => {
    if (remaining <= 0) { toast.error("Nothing left to invoice"); return; }
    setSaving(true);
    try {
      const created = await createProgressInvoice({
        parent_invoice_id: invoice.id,
        amount: Math.round(remaining * 100) / 100,
        description: `Final balance for ${invoice.number}`,
      });
      toast.success(`${created.number} created`);
      router.push(`/invoices/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create remainder invoice");
    }
    setSaving(false);
  };

  const handleAddPayment = async () => {
    setSaving(true);
    const wasPaid = invoice.status === "paid";
    try {
      const paid = parseFloat(paymentAmount);
      await addPayment(invoice.id, {
        amount: paid,
        date: paymentDate,
        method: paymentMethod,
        reference: paymentRef || undefined,
      });
      toast.success("Payment recorded");
      setShowPayment(false);
      // If this payment closes the invoice, celebrate.
      // amount_paid arrives as a string, so this was "100.00" + 50 → "100.0050"
      // and the comparison never fired: the invoice went paid without confetti.
      if (!wasPaid && (num(invoice.amount_paid) + paid + 0.005) >= num(invoice.total)) {
        setConfettiKey((k) => k + 1);
      }
      router.refresh();
    } catch { toast.error("Failed to record payment"); }
    setSaving(false);
  };

  if (editing) {
    return (
      <InvoiceEditor
        customers={customers}
        products={products}
        business={business}
        invoice={invoice}
        onSaved={(saved) => {
          // Update the in-memory invoice so download / status pills / totals
          // re-render with the just-saved values without needing a hard refresh.
          setInvoice((prev) => ({ ...prev, ...saved } as typeof prev));
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <DetailHero
        backHref="/invoices"
        eyebrow={invoice.number}
        title={customer?.name ?? "No client"}
        gradient={STATUS_GRADIENT[invoice.status] ?? "primary"}
        icon={<FileText className="w-6 h-6" />}
        status={invoice.status}
        subtitle={`Issued ${formatDate(invoice.issue_date)} · Due ${formatDate(invoice.due_date)}`}
        actions={
          <>
            {invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <AnimatedPress
                onClick={() => setShowPayment(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" /> Mark paid
              </AnimatedPress>
            )}
            {!isChild && invoice.status !== "cancelled" && remaining > 0 && (
              <>
                {isParent && (
                  <AnimatedPress
                    onClick={handleSendRemainder}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer ${saving ? "opacity-60" : ""}`}
                  >
                    <ArrowRight className="w-4 h-4" /> Send remainder
                  </AnimatedPress>
                )}
                <AnimatedPress
                  onClick={() => setProgressOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
                >
                  <FileStack className="w-4 h-4" />
                  {progressInvoices.length === 0 ? "Send deposit" : "Add progress"}
                </AnimatedPress>
              </>
            )}
            <AnimatedPress
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer"
            >
              <Edit className="w-4 h-4" /> Edit
            </AnimatedPress>
            {invoice.status !== "cancelled" && (
              <AnimatedPress
                onClick={() => setSendOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
              >
                <Send className="w-4 h-4" /> Send
              </AnimatedPress>
            )}
            {invoice.customer_id && (
              <AnimatedPress
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer"
              >
                <Link2 className="w-4 h-4" /> Share
              </AnimatedPress>
            )}
            <InvoicePDFDownload invoiceId={invoice.id} invoiceNumber={invoice.number} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl"><MoreHorizontal className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleStatusChange("draft")}>Reset to draft</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("sent")}>Mark as sent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("paid")}>Mark as paid</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("cancelled")}>Mark as cancelled</DropdownMenuItem>
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
          <FactCard gradient="emerald" icon={<DollarSign className="w-4 h-4" />} label="Total"      value={formatCurrency(invoice.total, business.currency)} />
          <FactCard gradient="blue"    icon={<DollarSign className="w-4 h-4" />} label="Paid"       value={formatCurrency(invoice.amount_paid, business.currency)} />
          <FactCard gradient="amber"   icon={<DollarSign className="w-4 h-4" />} label="Balance"    value={formatCurrency(invoice.total - invoice.amount_paid, business.currency)} />
          <FactCard gradient="violet"  icon={<Calendar   className="w-4 h-4" />} label="Due"        value={formatDate(invoice.due_date)} />
        </div>
      </FadeIn>

      {/* Linked parent / progress strip */}
      {(isChild || isParent) && (
        <FadeIn delay={130}>
          <div className="rounded-xl border border-border bg-card p-5">
            {isChild && parentInvoice && (
              <Link href={`/invoices/${parentInvoice.id}`} className="block">
                <AnimatedPress className="flex items-center gap-3">
                  <GradientTile gradient="violet" size={40} radius={10}>
                    <FileStack className="w-4 h-4" />
                  </GradientTile>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Progress payment for</p>
                    <p className="text-sm font-semibold">{parentInvoice.number} · {formatCurrency(parentInvoice.total, business.currency)} total</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">View parent <ArrowRight className="w-3 h-3" /></span>
                </AnimatedPress>
              </Link>
            )}
            {isParent && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <GradientTile gradient="violet" size={32} radius={8}>
                      <FileStack className="w-4 h-4" />
                    </GradientTile>
                    <p className="text-sm font-semibold">Progress invoices</p>
                  </div>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Billed</span>{" "}
                    <span className="font-semibold tabular-nums">{formatCurrency(billedSoFar, business.currency)}</span>
                    <span className="text-muted-foreground"> of </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(invoice.total, business.currency)}</span>
                    {depositsReceived > 0 && (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-emerald-600 font-semibold">{formatCurrency(depositsReceived, business.currency)} collected</span>
                      </>
                    )}
                    {remaining > 0 && (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-semibold">{formatCurrency(remaining, business.currency)} not yet invoiced</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {progressInvoices.map((c) => (
                    <Link key={c.id} href={`/invoices/${c.id}`} className="block">
                      <AnimatedPress className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-border/70 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-muted-foreground">{c.number}</span>
                          <KireiPill tone={c.status} />
                          <span className="text-xs text-muted-foreground break-words">
                            {(c.line_items?.[0] as LineItem | undefined)?.description ?? ""}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums text-sm">{formatCurrency(c.total, business.currency)}</span>
                      </AnimatedPress>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {/* Amount paid progress */}
      {invoice.status === "partial" && (
        <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-yellow-800 dark:text-yellow-400">Partial payment received</span>
            <span className="text-yellow-700 dark:text-yellow-400">{formatCurrency(invoice.amount_paid, business.currency)} of {formatCurrency(invoice.total, business.currency)}</span>
          </div>
          <div className="w-full bg-yellow-200 dark:bg-yellow-900/40 rounded-full h-2">
            <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{ width: `${(invoice.amount_paid / invoice.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice preview */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Business + Client */}
              <div className="flex flex-col sm:flex-row justify-between gap-6">
                <div>
                  <p className="font-bold text-lg">{business.name}</p>
                  {business.address && <p className="text-sm text-muted-foreground">{business.address}</p>}
                  {business.city && <p className="text-sm text-muted-foreground">{business.city}, {business.postcode}</p>}
                  {business.email && <p className="text-sm text-muted-foreground">{business.email}</p>}
                  {business.tax_number && <p className="text-xs text-muted-foreground mt-1">VAT: {business.tax_number}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-bold text-xl text-blue-600 dark:text-blue-400">INVOICE</p>
                  <p className="text-2xl font-bold mt-1">{invoice.number}</p>
                </div>
              </div>

              <Separator />

              {/* Bill to + dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Bill to</p>
                  {customer ? (
                    <>
                      <p className="font-medium">{customer.name}</p>
                      {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
                      {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
                      {customer.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
                      {customer.city && <p className="text-sm text-muted-foreground">{customer.city}, {customer.postcode}</p>}
                    </>
                  ) : <p className="text-sm text-muted-foreground">No client specified</p>}
                </div>
                <div className="text-right space-y-2">
                  <div><p className="text-xs text-muted-foreground">Issue date</p><p className="font-medium text-sm">{formatDate(invoice.issue_date)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Due date</p><p className="font-medium text-sm">{formatDate(invoice.due_date)}</p></div>
                </div>
              </div>

              {/* Line items table */}
              <div className="-mx-6 sm:mx-0 overflow-x-auto">
                <div className="min-w-[480px] px-6 sm:px-0">
                  <div className="grid grid-cols-[1fr_60px_80px_60px_80px] gap-2 pb-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Description</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Price</span>
                    <span className="text-center">Tax</span>
                    <span className="text-right">Total</span>
                  </div>
                  {lineItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_60px_80px_60px_80px] gap-2 py-3 border-b border-dashed">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                      </div>
                      <span className="text-center text-sm">{item.quantity}</span>
                      <span className="text-right text-sm">{formatCurrency(item.unit_price, business.currency)}</span>
                      <span className="text-center text-sm">{item.tax_rate}%</span>
                      <span className="text-right text-sm font-medium">{formatCurrency(item.total, business.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(invoice.subtotal, business.currency)}</span></div>
                  {invoice.discount_amount > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Discount</span><span>- {formatCurrency(invoice.discount_amount, business.currency)}</span></div>}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(invoice.tax_total, business.currency)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(invoice.total, business.currency)}</span></div>
                  {invoice.amount_paid > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600"><span>Paid</span><span>{formatCurrency(invoice.amount_paid, business.currency)}</span></div>
                  )}
                  {isParent && depositsReceived > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Deposits received</span>
                      <span>− {formatCurrency(depositsReceived, business.currency)}</span>
                    </div>
                  )}
                  {(invoice.amount_paid > 0 || (isParent && depositsReceived > 0)) && (
                    <div className="flex justify-between font-semibold">
                      <span>Balance due</span>
                      <span>{formatCurrency(isParent ? balanceAfterDeposits : invoice.total - invoice.amount_paid, business.currency)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes & terms */}
              {(invoice.notes || invoice.terms) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {invoice.notes && <div><p className="font-medium mb-1">Notes</p><p className="text-muted-foreground">{invoice.notes}</p></div>}
                    {invoice.terms && <div><p className="font-medium mb-1">Payment terms</p><p className="text-muted-foreground">{invoice.terms}</p></div>}
                  </div>
                </>
              )}

              {/* Bank details */}
              {business.bank_account_name && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <p className="font-medium mb-1">Bank details</p>
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
                      {business.bank_name && <><span>Bank</span><span>{business.bank_name}</span></>}
                      {business.bank_account_name && <><span>Name</span><span>{business.bank_account_name}</span></>}
                      {business.bank_account_number && <><span>Account</span><span>{business.bank_account_number}</span></>}
                      {business.bank_sort_code && <><span>Sort code</span><span>{business.bank_sort_code}</span></>}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <ScheduledSendsCard docType="invoice" docId={invoice.id} />
          <DeliveryStatusCard docType="invoice" docId={invoice.id} />
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
              <GradientTile gradient="emerald" size={32} radius={8}>
                <DollarSign className="w-4 h-4" />
              </GradientTile>
              <div>
                <h3 className="text-sm font-semibold">Payment history</h3>
                <p className="text-xs text-muted-foreground">Recorded payments on this invoice</p>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {(invoice.payments ?? []).length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No payments recorded</p>
              ) : (
                (invoice.payments as Payment[]).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-border/70">
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(payment.amount, business.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.date)} · {payment.method}</p>
                    </div>
                  </div>
                ))
              )}
              {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                <AnimatedPress
                  onClick={() => setShowPayment(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-sm font-medium text-primary cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" /> Record payment
                </AnimatedPress>
              )}
              {invoice.status !== "paid" && invoice.status !== "cancelled" && customer?.stripe_payment_method_id && (
                <AnimatedPress
                  onClick={async () => {
                    if (charging) return;
                    // This moves real money on a live Stripe integration, so it
                    // gets a styled dialog naming the amount rather than an
                    // unstyled browser prompt the browser is allowed to suppress.
                    if (!(await confirm({
                      title: "Charge the saved card?",
                      body: `${formatCurrency(Number(invoice.total) - Number(invoice.amount_paid), business.currency)} will be charged immediately to ${customer.name}'s card${customer.stripe_pm_last4 ? ` ending ${customer.stripe_pm_last4}` : ""}. Refunds have to be issued from Stripe.`,
                      confirmLabel: "Charge card",
                      destructive: false,
                    }))) return;
                    setCharging(true);
                    try {
                      const res = await chargeSavedCardNow(invoice.id);
                      if (res.ok) { toast.success(res.message); router.refresh(); }
                      else toast.error(res.message);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Charge failed");
                    } finally { setCharging(false); }
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer disabled:opacity-60"
                >
                  {charging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Charge saved card{customer.stripe_pm_last4 ? ` •••• ${customer.stripe_pm_last4}` : ""}
                </AnimatedPress>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference (optional)</Label>
              <Input placeholder="e.g. transaction ID" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowPayment(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleAddPayment} disabled={saving}>Record payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <SendDocumentModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        docType="Invoice"
        docNumber={invoice.number}
        defaultEmails={customer?.email ? [customer.email] : []}
        defaultPhone={customer?.phone ?? null}
        defaultSubject={`Invoice ${invoice.number} from ${business.name}`}
        defaultSmsBody={`Hi${customer?.name ? " " + customer.name.split(" ")[0] : ""}, invoice ${invoice.number} from ${business.name} is ready. Amount due: ${(invoice.total - invoice.amount_paid).toFixed(2)}.`}
        onSend={async (r) => {
          if (r.channel === "email") {
            await sendInvoiceEmail(invoice.id, { recipients: r.recipients, subject: r.subject });
            toast.success(`Invoice sent to ${(r.recipients ?? []).join(", ")}`);
          } else {
            await sendInvoiceSms(invoice.id, { to: r.to!, body: r.body });
            toast.success(`Invoice SMS sent to ${r.to}`);
          }
          setInvoice((prev) => ({ ...prev, status: prev.status === "draft" ? "sent" : prev.status }));
        }}
        onSchedule={async (sendAtIso, r) => {
          await scheduleSend({
            doc_type: "invoice",
            doc_id: invoice.id,
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

      {invoice.customer_id && (
        <ShareWithCustomerDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          customerId={invoice.customer_id}
          customerName={customer?.name ?? null}
          customerPhone={customer?.phone ?? null}
          docType="invoice"
          docId={invoice.id}
          docNumber={invoice.number}
        />
      )}

      {!isChild && (
        <ProgressInvoiceModal
          open={progressOpen}
          onOpenChange={setProgressOpen}
          parentInvoiceId={invoice.id}
          parentNumber={invoice.number}
          parentTotal={Number(invoice.total)}
          alreadyBilled={billedSoFar}
          currency={business.currency ?? "GBP"}
        />
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {invoice.number}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fires on every status flip to 'paid'. */}
      <Confetti fireKey={confettiKey} />
    </div>
  );
}
