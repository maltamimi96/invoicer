"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, FileText, MoreHorizontal, Copy, Trash2, Eye, Download, CheckCircle, Send, XCircle, DollarSign, AlertTriangle, Clock } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { deleteInvoice, duplicateInvoice, updateInvoice } from "@/lib/actions/invoices";
import { formatCurrency, formatDate, num, sumMoney } from "@/lib/utils";
import {
  StatTile, KireiTabs, KireiPill, EmptyState, AnimatedPress, FadeIn, GradientTile,
} from "@/components/ui/kirei";
import type { Customer, Invoice, InvoiceWithCustomer } from "@/types/database";
import type { GradientName as KireiGradient } from "@/components/ui/kirei";

const TABS = [
  { value: "all" as const,       label: "All"       },
  { value: "draft" as const,     label: "Draft"     },
  { value: "sent" as const,      label: "Sent"      },
  { value: "partial" as const,   label: "Partial"   },
  { value: "paid" as const,      label: "Paid"      },
  { value: "overdue" as const,   label: "Overdue"   },
  { value: "cancelled" as const, label: "Cancelled" },
];

type TabId = typeof TABS[number]["value"];

const STATUS_GRADIENT: Record<string, KireiGradient> = {
  paid:      "emerald",
  partial:   "blue",
  sent:      "blue",
  overdue:   "rose",
  cancelled: "rose",
  draft:     "primary",
};

interface InvoicesClientProps {
  invoices: InvoiceWithCustomer[];
  customers: Customer[];
  currency?: string;
}

export function InvoicesClient({ invoices: initial, currency = "GBP" }: InvoicesClientProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => invoices.filter((inv) => {
    const matchSearch = `${inv.number} ${inv.customers?.name ?? ""} ${inv.customers?.email ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = tab === "all" || inv.status === tab;
    return matchSearch && matchStatus;
  }), [invoices, search, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const t of TABS) c[t.value] = invoices.filter((i) => t.value === "all" || i.status === t.value).length;
    return c;
  }, [invoices]);

  const totalOutstanding = useMemo(
    // Correct before only by accident: `-` coerces its operands, so the inner
    // subtraction produced a real number even with string inputs. Made explicit
    // so nobody "simplifies" it into the same bug as the line below.
    () => sumMoney(
      invoices.filter((i) => ["sent", "partial", "overdue"].includes(i.status)),
      (i) => num(i.total) - num(i.amount_paid),
    ),
    [invoices]
  );
  const totalPaid = useMemo(
    // num(): `total` is a Postgres numeric, so PostgREST hands it over as a
    // string and `+` concatenated instead of adding — $NaN from two rows up.
    () => sumMoney(invoices.filter((i) => i.status === "paid"), (i) => i.total),
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
    window.open(`/api/pdf/invoice/${invoice.id}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} total · ${formatCurrency(totalOutstanding, currency)} outstanding`}
        actions={
          <>
            <CleanupButton entity="invoices" entityLabel="invoices" />
            <Link href="/invoices/new">
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" /> New invoice
              </AnimatedPress>
            </Link>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FadeIn delay={60}>
          <StatTile gradient="softTeal"  toneColor="#1f4f4a" icon={<FileText      className="w-3.5 h-3.5" />} label="Total"       value={String(invoices.length)} sub="all time" />
        </FadeIn>
        <FadeIn delay={110}>
          <StatTile gradient="softBlue"  toneColor="#1e3a8a" icon={<Clock         className="w-3.5 h-3.5" />} label="Outstanding" value={formatCurrency(totalOutstanding, currency)} sub="awaiting payment" />
        </FadeIn>
        <FadeIn delay={160}>
          <StatTile gradient="softTeal"  toneColor="#064e3b" icon={<DollarSign    className="w-3.5 h-3.5" />} label="Paid"        value={formatCurrency(totalPaid, currency)} sub="all time" />
        </FadeIn>
        <FadeIn delay={210}>
          <StatTile gradient="softRose"  toneColor="#9f1239" icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Overdue"     value={String(counts.overdue ?? 0)} sub="need follow-up" />
        </FadeIn>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <KireiTabs
          value={tab}
          onChange={setTab}
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] ?? 0 }))}
        />
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search invoices…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-7 h-7" />}
          gradient="primary"
          title={search || tab !== "all" ? "No matches" : "No invoices yet"}
          hint={search || tab !== "all" ? "Try different filters." : "Create your first invoice to get started."}
          cta={!search && tab === "all" ? { label: "New invoice", href: "/invoices/new", icon: <Plus className="w-4 h-4" /> } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
            <span className="flex-1">Invoice</span>
            <span className="hidden md:block w-32">Issued</span>
            <span className="hidden md:block w-32">Due</span>
            <span className="w-24 text-right">Status</span>
            <span className="w-28 text-right">Total</span>
            <span className="w-8" />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((invoice) => (
              <div
                key={invoice.id}
                onClick={() => router.push(`/invoices/${invoice.id}`)}
                onMouseEnter={() => router.prefetch(`/invoices/${invoice.id}`)}
                onAuxClick={(e) => { if (e.button === 1) window.open(`/invoices/${invoice.id}`, "_blank"); }}
                className="group flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <GradientTile gradient={STATUS_GRADIENT[invoice.status] ?? "primary"} size={40} radius={10}>
                  <FileText className="w-4 h-4" />
                </GradientTile>
                <div className="flex-1 min-w-[140px] basis-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{invoice.number}</span>
                  </div>
                  <div className="text-sm font-semibold break-words">{invoice.customers?.name ?? "No client"}</div>
                </div>
                <div className="hidden md:block w-32 text-xs text-muted-foreground">{formatDate(invoice.issue_date)}</div>
                <div className="hidden md:block w-32 text-xs text-muted-foreground">{formatDate(invoice.due_date)}</div>
                <div className="ml-auto md:ml-0 md:w-24 text-right">
                  <KireiPill tone={invoice.status} />
                </div>
                <div className="md:w-28 text-right text-sm font-semibold tabular-nums">{formatCurrency(invoice.total, currency)}</div>
                <div className="w-8 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
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
                      <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">Mark as</DropdownMenuLabel>
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
                </div>
              </div>
            ))}
          </div>
        </div>
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
