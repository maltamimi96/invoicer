"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Users, Mail, Phone, Building2, MoreHorizontal, Archive, Trash2, Upload } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { deleteCustomer, updateCustomer, bulkImportCustomers, bulkArchiveCustomers } from "@/lib/actions/customers";
import { formatCurrency } from "@/lib/utils";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import type { Customer } from "@/types/database";

const CUSTOMER_COLUMNS = [
  { key: "name",     label: "Name", required: true },
  { key: "email",    label: "Email" },
  { key: "phone",    label: "Phone" },
  { key: "company",  label: "Company" },
  { key: "address",  label: "Address" },
  { key: "city",     label: "City" },
  { key: "postcode", label: "Postcode" },
  { key: "country",  label: "Country" },
  { key: "notes",    label: "Notes" },
] as const;

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);
}

type CustomerStats = Record<string, {
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}>;

export function CustomersClient({
  customers: initial,
  stats = {},
  currency = "GBP",
}: {
  customers: Customer[];
  stats?: CustomerStats;
  currency?: string;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "archived" | "all">("active");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => customers.filter((c) => {
    const matchSearch = `${c.name} ${c.email ?? ""} ${c.company ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchTab    = tab === "all" || (tab === "active" ? !c.archived : !!c.archived);
    return matchSearch && matchTab;
  }), [customers, search, tab]);

  const counts = useMemo(() => ({
    all:      customers.length,
    active:   customers.filter((c) => !c.archived).length,
    archived: customers.filter((c) =>  c.archived).length,
    withEmail: customers.filter((c) => !!c.email).length,
    withCompany: customers.filter((c) => !!c.company).length,
  }), [customers]);

  const handleArchive = async (id: string) => {
    try {
      await updateCustomer(id, { archived: true });
      setCustomers((prev) => prev.map((c) => c.id === id ? { ...c, archived: true } : c));
      toast.success("Customer archived");
    } catch { toast.error("Failed to archive"); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCustomer(deleteId);
      setCustomers((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success("Customer deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${counts.active} active · ${counts.archived} archived`}
        actions={
          <>
            <CleanupButton entity="customers" entityLabel="customers" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setShowImport(true)}
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <Link href="/customers/new">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                <Plus className="w-3.5 h-3.5" /> Add customer
              </button>
            </Link>
          </>
        }
      />

      <div className="ch-stat-grid">
        <div className="ch-stat">
          <div className="ch-stat-label"><Users className="w-3.5 h-3.5" /><span>Total</span></div>
          <div className="ch-stat-value">{counts.all}</div>
          <div className="ch-stat-meta">{counts.active} active</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Mail className="w-3.5 h-3.5" /><span>With email</span></div>
          <div className="ch-stat-value">{counts.withEmail}</div>
          <div className="ch-stat-meta">reachable</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Building2 className="w-3.5 h-3.5" /><span>Companies</span></div>
          <div className="ch-stat-value">{counts.withCompany}</div>
          <div className="ch-stat-meta">B2B accounts</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Archive className="w-3.5 h-3.5" /><span>Archived</span></div>
          <div className="ch-stat-value">{counts.archived}</div>
          <div className="ch-stat-meta">hidden by default</div>
        </div>
      </div>

      <div className="ch-tabs">
        <button className={`ch-tab ${tab === "active"   ? "active" : ""}`} onClick={() => setTab("active")}>
          Active <span className="count">{counts.active}</span>
        </button>
        <button className={`ch-tab ${tab === "archived" ? "active" : ""}`} onClick={() => setTab("archived")}>
          Archived <span className="count">{counts.archived}</span>
        </button>
        <button className={`ch-tab ${tab === "all"      ? "active" : ""}`} onClick={() => setTab("all")}>
          All <span className="count">{counts.all}</span>
        </button>
      </div>

      <div className="ch-filter-bar">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* Bulk-action bar — appears when ≥1 row is selected */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-md border border-primary/30 bg-[hsl(var(--primary)/0.08)]"
        >
          <span className="text-sm font-medium text-primary">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(new Set())}
            >Clear</button>
            <button
              onClick={() => setBulkAction("archive")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
            <button
              onClick={() => setBulkAction("delete")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </motion.div>
      )}

      {filtered.length === 0 ? (
        <div className="ch-empty">
          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h4>No customers found</h4>
          <p>{search ? "Try a different search." : "Add your first customer to get started."}</p>
          {!search && (
            <Link href="/customers/new">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
                <Plus className="w-3 h-3" /> Add customer
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
                <th style={{ width: 32 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) filtered.forEach((c) => next.add(c.id));
                      else filtered.forEach((c) => next.delete(c.id));
                      setSelected(next);
                    }}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                </th>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="num">Invoices</th>
                <th className="num">Billed</th>
                <th className="num">Outstanding</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const s = stats[customer.id];
                const checked = selected.has(customer.id);
                return (
                <tr key={customer.id} onClick={() => router.push(`/customers/${customer.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${customer.name}`}
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(customer.id);
                        else next.add(customer.id);
                        setSelected(next);
                      }}
                      className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] flex items-center justify-center font-semibold text-[11px] flex-shrink-0">
                        {initials(customer.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{customer.name}</div>
                        {customer.company && (
                          <div className="text-[11.5px] text-muted-foreground truncate inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {customer.company}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-muted-foreground">
                    {customer.email ? (
                      <span className="inline-flex items-center gap-1.5"><Mail className="w-3 h-3" /> {customer.email}</span>
                    ) : "—"}
                  </td>
                  <td className="text-muted-foreground">
                    {customer.phone ? (
                      <span className="inline-flex items-center gap-1.5"><Phone className="w-3 h-3" /> {customer.phone}</span>
                    ) : "—"}
                  </td>
                  <td className="num">
                    {s?.invoice_count ? <span className="font-medium">{s.invoice_count}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="num">
                    {s?.total_billed ? formatCurrency(s.total_billed, currency) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="num">
                    {s?.outstanding ? <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(s.outstanding, currency)}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td>
                    <span className={`ch-pill ${customer.archived ? "archived" : "active"}`}>
                      {customer.archived ? "archived" : "active"}
                    </span>
                  </td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/customers/${customer.id}`}>View details</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/invoices/new?customer=${customer.id}`}>New invoice</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/quotes/new?customer=${customer.id}`}>New quote</Link></DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!customer.archived && (
                          <DropdownMenuItem onClick={() => handleArchive(customer.id)} className="gap-2">
                            <Archive className="w-3.5 h-3.5" />Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDeleteId(customer.id)} className="text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      <BulkImportModal
        open={showImport}
        onOpenChange={setShowImport}
        title="Import customers"
        columns={CUSTOMER_COLUMNS as unknown as import("@/components/shared/bulk-import-modal").ColumnDef[]}
        onImport={(rows) => bulkImportCustomers(rows as Parameters<typeof bulkImportCustomers>[0])}
        onSuccess={(count) => {
          toast.success(`${count} customer${count !== 1 ? "s" : ""} imported`);
          window.location.reload();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Their invoices and quotes will not be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk action confirmation */}
      <AlertDialog open={!!bulkAction} onOpenChange={() => !busy && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "delete" ? "Delete" : "Archive"} {selected.size} customer{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? "This permanently removes the rows. Their invoices and quotes will lose their customer link but otherwise stay put. This cannot be undone."
                : "Archived customers are hidden by default. You can find them under the Archived tab and unarchive any of them later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                if (!bulkAction) return;
                setBusy(true);
                try {
                  const ids = [...selected];
                  await bulkArchiveCustomers(ids, bulkAction === "delete" ? "hard" : "archive");
                  if (bulkAction === "delete") {
                    setCustomers((prev) => prev.filter((c) => !selected.has(c.id)));
                  } else {
                    setCustomers((prev) => prev.map((c) => selected.has(c.id) ? { ...c, archived: true } : c));
                  }
                  toast.success(`${ids.length} ${bulkAction === "delete" ? "deleted" : "archived"}`);
                  setSelected(new Set());
                } catch { toast.error("Couldn't complete the bulk action"); }
                setBusy(false);
                setBulkAction(null);
              }}
              className={bulkAction === "delete"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""}
            >
              {busy ? "Working…" : bulkAction === "delete" ? "Delete" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
