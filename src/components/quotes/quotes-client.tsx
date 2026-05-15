"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, FileCheck, MoreHorizontal, Trash2, Eye, ArrowRight, Download, Send, CheckCircle, XCircle, TrendingUp, Briefcase } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { deleteQuote, convertQuoteToInvoice, updateQuote } from "@/lib/actions/quotes";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  StatTile, KireiTabs, KireiPill, EmptyState, AnimatedPress, FadeIn, GradientTile,
} from "@/components/ui/kirei";
import type { Customer, QuoteWithCustomer } from "@/types/database";
import type { GradientName as KireiGradient } from "@/components/ui/kirei";

const TABS = [
  { value: "all" as const,      label: "All"      },
  { value: "draft" as const,    label: "Draft"    },
  { value: "sent" as const,     label: "Sent"     },
  { value: "accepted" as const, label: "Accepted" },
  { value: "rejected" as const, label: "Rejected" },
  { value: "expired" as const,  label: "Expired"  },
];

type TabId = typeof TABS[number]["value"];

const STATUS_GRADIENT: Record<string, KireiGradient> = {
  accepted: "emerald",
  sent:     "blue",
  rejected: "rose",
  expired:  "rose",
  draft:    "violet",
};

export function QuotesClient({ quotes: initial, currency = "GBP" }: { quotes: QuoteWithCustomer[]; customers: Customer[]; currency?: string }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  const filtered = useMemo(() => quotes.filter((q) => {
    const matchSearch = `${q.number} ${q.customers?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = tab === "all" || q.status === tab;
    return matchSearch && matchStatus;
  }), [quotes, search, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length };
    for (const t of TABS) c[t.value] = quotes.filter((q) => t.value === "all" || q.status === t.value).length;
    return c;
  }, [quotes]);

  const totalPipeline = useMemo(() => quotes.filter((q) => q.status === "sent").reduce((s, q) => s + q.total, 0), [quotes]);
  const totalAccepted = useMemo(() => quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + q.total, 0), [quotes]);
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

  const downloadPdf = (quote: { id: string }) => window.open(`/api/pdf/quote/${quote.id}`, "_blank");

  const handleConvert = async (id: string) => {
    setConverting(id);
    try {
      const invoice = await convertQuoteToInvoice(id);
      toast.success("Quote converted to invoice!");
      router.push(`/invoices/${invoice.id}`);
    } catch { toast.error("Failed to convert"); setConverting(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} total · ${formatCurrency(totalPipeline, currency)} in pipeline`}
        accent="linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)"
        actions={
          <>
            <CleanupButton entity="quotes" entityLabel="quotes" />
            <Link href="/quotes/new">
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" /> New quote
              </AnimatedPress>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FadeIn delay={60}>
          <StatTile gradient="softTeal"   toneColor="#1f4f4a" icon={<FileCheck  className="w-3.5 h-3.5" />} label="Total"          value={String(quotes.length)}            sub="all time" />
        </FadeIn>
        <FadeIn delay={110}>
          <StatTile gradient="softBlue"   toneColor="#1e3a8a" icon={<Briefcase  className="w-3.5 h-3.5" />} label="Open pipeline"  value={formatCurrency(totalPipeline, currency)} sub="awaiting decision" />
        </FadeIn>
        <FadeIn delay={160}>
          <StatTile gradient="softTeal"   toneColor="#064e3b" icon={<CheckCircle className="w-3.5 h-3.5" />} label="Accepted"      value={formatCurrency(totalAccepted, currency)} sub="won deals" />
        </FadeIn>
        <FadeIn delay={210}>
          <StatTile gradient="softViolet" toneColor="#3b1d6b" icon={<TrendingUp  className="w-3.5 h-3.5" />} label="Acceptance"    value={`${acceptanceRate}%`}              sub="of decided quotes" />
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
          <Input placeholder="Search quotes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileCheck className="w-7 h-7" />}
          gradient="violet"
          title={search || tab !== "all" ? "No matches" : "No quotes yet"}
          hint={search || tab !== "all" ? "Try different filters." : "Send your first quote to get started."}
          cta={!search && tab === "all" ? { label: "New quote", href: "/quotes/new", icon: <Plus className="w-4 h-4" /> } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
            <span className="flex-1">Quote</span>
            <span className="hidden md:block w-32">Issued</span>
            <span className="hidden md:block w-32">Expires</span>
            <span className="w-24 text-right">Status</span>
            <span className="w-28 text-right">Total</span>
            <span className="w-8" />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((quote) => (
              <div
                key={quote.id}
                onClick={() => router.push(`/quotes/${quote.id}`)}
                className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <GradientTile gradient={STATUS_GRADIENT[quote.status] ?? "primary"} size={40} radius={10}>
                  <FileCheck className="w-4 h-4" />
                </GradientTile>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-muted-foreground">{quote.number}</div>
                  <div className="text-sm font-semibold truncate">{quote.customers?.name ?? "No client"}</div>
                </div>
                <div className="hidden md:block w-32 text-xs text-muted-foreground">{formatDate(quote.issue_date)}</div>
                <div className="hidden md:block w-32 text-xs text-muted-foreground">{formatDate(quote.expiry_date)}</div>
                <div className="w-24 text-right">
                  <KireiPill tone={quote.status} />
                </div>
                <div className="w-28 text-right text-sm font-semibold tabular-nums">{formatCurrency(quote.total, currency)}</div>
                <div className="w-8 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
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
                      <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">Mark as</DropdownMenuLabel>
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
                </div>
              </div>
            ))}
          </div>
        </div>
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
