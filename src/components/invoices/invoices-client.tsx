"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Search, FileText, MoreHorizontal, Copy, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteInvoice, duplicateInvoice } from "@/lib/actions/invoices";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import type { Customer, InvoiceWithCustomer } from "@/types/database";

const STATUSES = ["all", "draft", "sent", "paid", "overdue", "partial", "cancelled"];

interface InvoicesClientProps {
  invoices: InvoiceWithCustomer[];
  customers: Customer[];
  currency?: string;
}

export function InvoicesClient({ invoices: initial, currency = "GBP" }: InvoicesClientProps) {
  const [invoices, setInvoices] = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = invoices.filter((inv) => {
    const matchSearch = `${inv.number} ${inv.customers?.name} ${inv.customers?.email}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = status === "all" || inv.status === status;
    return matchSearch && matchStatus;
  });

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

  const totals = {
    all: filtered.reduce((s, i) => s + i.total, 0),
    outstanding: filtered.filter(i => ["sent", "partial"].includes(i.status)).reduce((s, i) => s + i.total - i.amount_paid, 0),
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{invoices.length} total · {formatCurrency(totals.outstanding, currency)} outstanding</p>
        </div>
        <Link href="/invoices/new">
          <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />New invoice</Button>
        </Link>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-medium mb-1">No invoices found</h3>
          <p className="text-sm text-muted-foreground mb-4">{search || status !== "all" ? "Try different filters" : "Create your first invoice to get started"}</p>
          {!search && status === "all" && <Link href="/invoices/new"><Button size="sm">Create invoice</Button></Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((invoice, i) => (
            <motion.div key={invoice.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <div>
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {invoice.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">{invoice.customers?.name ?? "No client"}</p>
                      </div>
                      <div className="hidden sm:block text-sm text-muted-foreground">
                        Issued {formatDate(invoice.issue_date)}
                      </div>
                      <div className="hidden sm:block text-sm text-muted-foreground">
                        Due {formatDate(invoice.due_date)}
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <Badge variant="secondary" className={`text-xs ${getStatusColor(invoice.status)}`}>{invoice.status}</Badge>
                        <span className="font-semibold text-sm">{formatCurrency(invoice.total, currency)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/invoices/${invoice.id}`} className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" />View</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(invoice.id)} className="gap-2">
                          <Copy className="w-3.5 h-3.5" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleteId(invoice.id)} className="text-destructive gap-2">
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
