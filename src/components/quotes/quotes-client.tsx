"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, FileCheck, MoreHorizontal, Trash2, Eye, ArrowRight, Download, Send, CheckCircle, XCircle } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { deleteQuote, convertQuoteToInvoice, updateQuote } from "@/lib/actions/quotes";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, QuoteWithCustomer } from "@/types/database";

const TABS = [
  { id: "all",      label: "All"      },
  { id: "draft",    label: "Draft"    },
  { id: "sent",     label: "Sent"     },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "expired",  label: "Expired"  },
] as const;

export function QuotesClient({ quotes: initial, currency = "GBP" }: { quotes: QuoteWithCustomer[]; customers: Customer[]; currency?: string }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  const filtered = useMemo(() => quotes.filter((q) => {
    const matchSearch = `${q.number} ${q.customers?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = tab === "all" || q.status === tab;
    return matchSearch && matchStatus;
  }), [quotes, search, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length };
    for (const t of TABS) c[t.id] = quotes.filter((q) => t.id === "all" || q.status === t.id).length;
    return c;
  }, [quotes]);

  const totalPipeline = useMemo(
    () => quotes.filter((q) => q.status === "sent").reduce((s, q) => s + q.total, 0),
    [quotes]
  );
  const totalAccepted = useMemo(
    () => quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + q.total, 0),
    [quotes]
  );
  const acceptanceRate = quotes.length === 0
    ? 0
    : Math.round((counts.accepted / Math.max(counts.accepted + counts.rejected + counts.expired, 1)) * 100);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteQuote(deleteId);
      setQuotes((prev) => prev.filter((q) => q.id !== deleteId));
      toast.success("Quote deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
  };

  const handleStatusChange = async (id: string, status: QuoteWithCustomer["status"]) => {
    const prev = quotes;
    setQuotes((p) => p.map((q) => (q.id === id ? { ...q, status } : q)));
    try {
      await updateQuote(id, { status });
      toast.success(`Marked as ${status}`);
    } catch {
      setQuotes(prev);
      toast.error("Failed to update status");
    }
  };

  const downloadPdf = (quote: { id: string }) => {
    window.open(`/api/pdf/quote/${quote.id}`, "_blank");
  };

  const handleConvert = async (id: string) => {
    setConverting(id);
    try {
      const invoice = await convertQuoteToInvoice(id);
      toast.success("Quote converted to invoice!");
      router.push(`/invoices/${invoice.id}`);
    } catch { toast.error("Failed to convert"); setConverting(null); }
  };

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} total · ${formatCurrency(totalPipeline, currency)} in pipeline`}
        actions={
          <Link href="/quotes/new">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" /> New quote
            </button>
          </Link>
        }
      />

      <div className="ch-stat-grid">
        <div className="ch-stat">
          <div className="ch-stat-label"><FileCheck className="w-3.5 h-3.5" /><span>Total</span></div>
          <div className="ch-stat-value">{quotes.length}</div>
          <div className="ch-stat-meta">all time</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileCheck className="w-3.5 h-3.5" /><span>Open pipeline</span></div>
          <div className="ch-stat-value">{formatCurrency(totalPipeline, currency)}</div>
          <div className="ch-stat-meta">awaiting decision</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileCheck className="w-3.5 h-3.5" /><span>Accepted</span></div>
          <div className="ch-stat-value">{formatCurrency(totalAccepted, currency)}</div>
          <div className="ch-stat-meta">won deals</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><FileCheck className="w-3.5 h-3.5" /><span>Acceptance rate</span></div>
          <div className="ch-stat-value">{acceptanceRate}%</div>
          <div className="ch-stat-meta">of decided quotes</div>
        </div>
      </div>

      <div className="ch-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`ch-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
            <span className="count">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="ch-filter-bar">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ch-empty">
          <FileCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h4>No quotes found</h4>
          <p>{search || tab !== "all" ? "Try different filters." : "Create your first quote."}</p>
          {!search && tab === "all" && (
            <Link href="/quotes/new">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                <Plus className="w-3 h-3" /> Create quote
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
                <th>Quote</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((quote) => (
                <tr key={quote.id} onClick={() => router.push(`/quotes/${quote.id}`)}>
                  <td><span className="ref">{quote.number}</span></td>
                  <td className="font-medium">{quote.customers?.name ?? "No client"}</td>
                  <td className="text-muted-foreground">{formatDate(quote.issue_date)}</td>
                  <td className="text-muted-foreground">{formatDate(quote.expiry_date)}</td>
                  <td><span className={`ch-pill ${quote.status}`}>{quote.status}</span></td>
                  <td className="num font-semibold">{formatCurrency(quote.total, currency)}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/quotes/${quote.id}`} className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" />View</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadPdf(quote)} className="gap-2">
                          <Download className="w-3.5 h-3.5" />Download PDF
                        </DropdownMenuItem>
                        {!quote.invoice_id && (
                          <DropdownMenuItem onClick={() => handleConvert(quote.id)} disabled={converting === quote.id} className="gap-2">
                            <ArrowRight className="w-3.5 h-3.5" />Convert to invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
                          Mark as
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleStatusChange(quote.id, "sent")} className="gap-2" disabled={quote.status === "sent"}>
                          <Send className="w-3.5 h-3.5" />Sent
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(quote.id, "accepted")} className="gap-2" disabled={quote.status === "accepted"}>
                          <CheckCircle className="w-3.5 h-3.5" />Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(quote.id, "rejected")} className="gap-2" disabled={quote.status === "rejected"}>
                          <XCircle className="w-3.5 h-3.5" />Rejected
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(quote.id, "expired")} className="gap-2" disabled={quote.status === "expired"}>
                          <XCircle className="w-3.5 h-3.5" />Expired
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(quote.id)} className="text-destructive gap-2">
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
            <AlertDialogTitle>Delete quote?</AlertDialogTitle>
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
