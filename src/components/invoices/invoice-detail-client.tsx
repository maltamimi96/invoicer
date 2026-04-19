"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Edit, Send, Copy, Trash2, CheckCircle, DollarSign, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateInvoice, deleteInvoice, duplicateInvoice, addPayment, sendInvoiceEmail } from "@/lib/actions/invoices";
import { InvoiceEditor } from "./invoice-editor";
import { InvoicePDFDownload } from "./invoice-pdf";

import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import type { Business, Customer, Invoice, LineItem, Payment, Product } from "@/types/database";

interface InvoiceDetailClientProps {
  invoice: Invoice & { customers?: Customer | null; payments?: Payment[] };
  customers: Customer[];
  products: Product[];
  business: Business;
}

export function InvoiceDetailClient({ invoice: initial, customers, products, business }: InvoiceDetailClientProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(String((invoice.total - invoice.amount_paid).toFixed(2)));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSendEmail = async () => {
    setSending(true);
    try {
      await sendInvoiceEmail(invoice.id);
      setInvoice((prev) => ({ ...prev, status: prev.status === "draft" ? "sent" : prev.status }));
      toast.success(`Invoice sent to ${customer?.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const lineItems = (invoice.line_items ?? []) as LineItem[];
  const customer = customers.find((c) => c.id === invoice.customer_id);

  const handleStatusChange = async (status: Invoice["status"]) => {
    try {
      const updated = await updateInvoice(invoice.id, { status });
      setInvoice((prev) => ({ ...prev, ...updated }));
      toast.success(`Invoice marked as ${status}`);
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

  const handleAddPayment = async () => {
    setSaving(true);
    try {
      await addPayment(invoice.id, {
        amount: parseFloat(paymentAmount),
        date: paymentDate,
        method: paymentMethod,
        reference: paymentRef || undefined,
      });
      toast.success("Payment recorded");
      setShowPayment(false);
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
      />
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{invoice.number}</h1>
            <Badge variant="secondary" className={`${getStatusColor(invoice.status)}`}>{invoice.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{customer?.name ?? "No client"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowPayment(true)}>
              <CheckCircle className="w-3.5 h-3.5" />Mark paid
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Edit className="w-3.5 h-3.5" />Edit
          </Button>
          {invoice.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={customer?.email ? handleSendEmail : () => toast.error("Add an email address to this customer first")}
              disabled={sending}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send email
            </Button>
          )}
          <InvoicePDFDownload invoiceId={invoice.id} invoiceNumber={invoice.number} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleStatusChange("sent")}>Mark as sent</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("paid")}>Mark as paid</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("cancelled")}>Mark as cancelled</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDuplicate} className="gap-2"><Copy className="w-3.5 h-3.5" />Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive gap-2"><Trash2 className="w-3.5 h-3.5" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

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
                    <>
                      <div className="flex justify-between text-sm text-emerald-600"><span>Paid</span><span>{formatCurrency(invoice.amount_paid, business.currency)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatCurrency(invoice.total - invoice.amount_paid, business.currency)}</span></div>
                    </>
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
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(invoice.payments ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No payments recorded</p>
              ) : (
                (invoice.payments as Payment[]).map((payment) => (
                  <div key={payment.id} className="flex justify-between text-sm">
                    <div>
                      <p className="font-medium">{formatCurrency(payment.amount, business.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.date)} · {payment.method}</p>
                    </div>
                  </div>
                ))
              )}
              {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowPayment(true)}>
                  <DollarSign className="w-3.5 h-3.5" />Record payment
                </Button>
              )}
            </CardContent>
          </Card>
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
            <div className="grid grid-cols-2 gap-4">
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
    </div>
  );
}
