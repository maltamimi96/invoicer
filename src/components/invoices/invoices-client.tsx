"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, FileText, MoreHorizontal, Copy, Trash2, Eye, Download, CheckCircle, Send, XCircle } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { deleteInvoice, duplicateInvoice, updateInvoice } from "@/lib/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, Invoice, InvoiceWithCustomer } from "@/types/database";

const TABS = [
  { id: "all",       label: "All"       },
  { id: "draft",     label: "Draft"     },
  { id: "sent",      label: "Sent"      },
  { id: "partial",   label: "Partial"   },
  { id: "paid",      label: "Paid"      },
  { id: "overdue",   label: "Overdue"   },
  { id: "cancelled", label: "Cancelled" },
] as const;

interface InvoicesClientProps {
  invoices: InvoiceWithCustomer[];
  customers: Customer[];
  currency?: string;
}

export function InvoicesClient({ invoices: initial, currency = "GBP" }: InvoicesClientProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => invoices.filter((inv) => {
    const matchSearch = `${inv.number} ${inv.customers?.name ?? ""} ${inv.customers?.email ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = tab === "all" || inv.status === tab;
    return matchSearch && matchStatus;
  }), [invoices, search, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const t of TABS) c[t.id] = invoices.filter((i) => t.id === "all" || i.status === t.id).length;
    return c;
  }, [invoices]);

  const totalOutstanding = useMemo(
    () => invoices.filter((i) => ["sent", "partial", "overdue"].includes(i.status))
                  .reduce((s, i) => s + (i.total - i.amount_paid), 0),
    [invoices]
  );
  const totalPaid = useMemo(
    () => invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0),
    [invoices]
  );

  const handleDuplicate = async (id: string) => {
    try {
      const newInv = await duplicateInvoice(id);
      setInvoices((prev) => [{ ...newInv, customers: null }, ...prev]);
      toast.success("Invoice duplicated");
    } catch { toast.error("Failed to duplicate"); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteInvoice(deleteId);
      setInvoices((prev) => prev.filter((i) => i.id !== deleteId));
      toast.success("Invoice deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
  };

  const handleStatusChange = async (id: string, status: Invoice["status"]) => {
    // Optimistic update — most actions are instant in the UI; revert on failure.
    const prev = invoices;
    setInvoices((p) => p.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await updateInvoice(id, { status });
      toast.success(`Marked as ${status}`);
    } catch {
      setInvoices(prev);
      toast.error("Failed to update status");
    }
  };

  const downloadPdf = (invoice: { id: string; number: string }) => {
    // Open the PDF route in a new tab — same backend used by the detail page's download.
    window.open(`/api/pdf/invoice/${invoice.id}`, "_blank");
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} total · ${formatCurrency(totalOutstanding, currency)} outstanding`}
        actions={
          <Link href="/invoices/new">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" /> New invoice
            </button>
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="ch-stat-grid">
        <div className="ch-stat">
          <div className="ch-stat-label"><FileText className="w-3.5 h-3.5" /><span>Total</span></div>
          <div className="ch-stat-value">{invoices.length}</div>
          <div className="ch-stat-meta">all time</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileText className="w-3.5 h-3.5" /><span>Outstanding</span></div>
          <div className="ch-stat-value">{formatCurrency(totalOutstanding, currency)}</div>
          <div className="ch-stat-meta">awaiting payment</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileText className="w-3.5 h-3.5" /><span>Paid</span></div>
          <div className="ch-stat-value">{formatCurrency(totalPaid, currency)}</div>
          <div className="ch-stat-meta">all time</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileText className="w-3.5 h-3.5" /><span>Overdue</span></div>
          <div className="ch-stat-value">{counts.overdue ?? 0}</div>
          <div className="ch-stat-meta">need follow-up</div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="ch-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ch-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="count">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="ch-filter-bar">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="ch-empty">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h4>No invoices found</h4>
          <p>{search || tab !== "all" ? "Try different filters." : "Create your first invoice to get started."}</p>
          {!search && tab === "all" && (
            <Link href="/invoices/new">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                <Plus className="w-3 h-3" /> Create invoice
              </button>
            </Link>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
          className="ch-table-wrap"
        >
          <table className="ch-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => router.push(`/invoices/${invoice.id}`)}
                  onAuxClick={(e) => { if (e.button === 1) window.open(`/invoices/${invoice.id}`, "_blank"); }}
                >
                  <td><span className="ref">{invoice.number}</span></td>
                  <td className="font-medium">{invoice.customers?.name ?? "No client"}</td>
                  <td className="text-muted-foreground">{formatDate(invoice.issue_date)}</td>
                  <td className="text-muted-foreground">{formatDate(invoice.due_date)}</td>
                  <td><span className={`ch-pill ${invoice.status}`}>{invoice.status}</span></td>
                  <td className="num font-semibold">{formatCurrency(invoice.total, currency)}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/invoices/${invoice.id}`} className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" />View</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadPdf(invoice)} className="gap-2">
                          <Download className="w-3.5 h-3.5" />Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(invoice.id)} className="gap-2">
                          <Copy className="w-3.5 h-3.5" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                          Mark as
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "sent")} className="gap-2" disabled={invoice.status === "sent"}>
                          <Send className="w-3.5 h-3.5" />Sent
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "paid")} className="gap-2" disabled={invoice.status === "paid"}>
                          <CheckCircle className="w-3.5 h-3.5" />Paid
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "overdue")} className="gap-2" disabled={invoice.status === "overdue"}>
                          <FileText className="w-3.5 h-3.5" />Overdue
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "cancelled")} className="gap-2" disabled={invoice.status === "cancelled"}>
                          <XCircle className="w-3.5 h-3.5" />Cancelled
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(invoice.id)} className="text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
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
