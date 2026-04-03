"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Search, FileCheck, MoreHorizontal, Trash2, Eye, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteQuote, convertQuoteToInvoice } from "@/lib/actions/quotes";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { Customer, QuoteWithCustomer } from "@/types/database";

const STATUSES = ["all", "draft", "sent", "accepted", "rejected", "expired"];

export function QuotesClient({ quotes: initial, currency = "GBP" }: { quotes: QuoteWithCustomer[]; customers: Customer[]; currency?: string }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  const filtered = quotes.filter((q) => {
    const matchSearch = `${q.number} ${q.customers?.name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = status === "all" || q.status === status;
    return matchSearch && matchStatus;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteQuote(deleteId);
      setQuotes((prev) => prev.filter((q) => q.id !== deleteId));
      toast.success("Quote deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{quotes.length} total</p>
        </div>
        <Link href="/quotes/new">
          <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />New quote</Button>
        </Link>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <FileCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-medium mb-1">No quotes found</h3>
          <p className="text-sm text-muted-foreground mb-4">{search || status !== "all" ? "Try different filters" : "Create your first quote"}</p>
          {!search && status === "all" && <Link href="/quotes/new"><Button size="sm">Create quote</Button></Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((quote, i) => (
            <motion.div key={quote.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <div>
                        <Link href={`/quotes/${quote.id}`} className="font-medium text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{quote.number}</Link>
                        <p className="text-xs text-muted-foreground">{quote.customers?.name ?? "No client"}</p>
                      </div>
                      <div className="hidden sm:block text-sm text-muted-foreground">Issued {formatDate(quote.issue_date)}</div>
                      <div className="hidden sm:block text-sm text-muted-foreground">Expires {formatDate(quote.expiry_date)}</div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <Badge variant="secondary" className={`text-xs ${getStatusColor(quote.status)}`}>{quote.status}</Badge>
                        <span className="font-semibold text-sm">{formatCurrency(quote.total, currency)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/quotes/${quote.id}`} className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" />View</Link>
                        </DropdownMenuItem>
                        {!quote.invoice_id && (
                          <DropdownMenuItem onClick={() => handleConvert(quote.id)} disabled={converting === quote.id} className="gap-2">
                            <ArrowRight className="w-3.5 h-3.5" />Convert to invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(quote.id)} className="text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
