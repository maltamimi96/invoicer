"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Users, Mail, Phone, Building2, MoreHorizontal, Archive, Trash2, Upload, ChevronRight } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { deleteCustomer, updateCustomer, bulkImportCustomers, bulkArchiveCustomers } from "@/lib/actions/customers";
import { formatCurrency } from "@/lib/utils";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import {
  StatTile, KireiTabs, KireiAvatar, KireiPill, EmptyState, AnimatedPress, FadeIn,
} from "@/components/ui/kirei";
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
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle={`${counts.active} active · ${counts.archived} archived`}
        actions={
          <>
            <CleanupButton entity="customers" entityLabel="customers" />
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setShowImport(true)}
            >
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <Link href="/customers/new">
              <AnimatedPress className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" /> Add customer
              </AnimatedPress>
            </Link>
          </>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FadeIn delay={60}>
          <StatTile gradient="softTeal"   toneColor="#1f4f4a" icon={<Users      className="w-3.5 h-3.5" />} label="Total"      value={String(counts.all)}        sub={`${counts.active} active`} />
        </FadeIn>
        <FadeIn delay={110}>
          <StatTile gradient="softBlue"   toneColor="#1e3a8a" icon={<Mail       className="w-3.5 h-3.5" />} label="With email" value={String(counts.withEmail)}  sub="reachable" />
        </FadeIn>
        <FadeIn delay={160}>
          <StatTile gradient="softViolet" toneColor="#3b1d6b" icon={<Building2  className="w-3.5 h-3.5" />} label="Companies"  value={String(counts.withCompany)} sub="B2B accounts" />
        </FadeIn>
        <FadeIn delay={210}>
          <StatTile gradient="softAmber"  toneColor="#78350f" icon={<Archive    className="w-3.5 h-3.5" />} label="Archived"   value={String(counts.archived)}   sub="hidden by default" />
        </FadeIn>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <KireiTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "active",   label: "Active",   count: counts.active },
            { value: "archived", label: "Archived", count: counts.archived },
            { value: "all",      label: "All",      count: counts.all },
          ]}
        />
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 rounded-xl" />
        </div>
      </div>

      {/* Bulk-action bar — appears when ≥1 row is selected */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-primary/30 bg-[hsl(var(--primary)/0.08)]"
        >
          <span className="text-sm font-semibold text-primary">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>Clear</button>
            <button
              onClick={() => setBulkAction("archive")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
            <button
              onClick={() => setBulkAction("delete")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </motion.div>
      )}

      {/* Card list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          gradient="primary"
          title={search ? "No matches" : "No customers yet"}
          hint={search ? "Try a different search term." : "Add your first customer to get started."}
          cta={!search ? { label: "Add customer", href: "/customers/new", icon: <Plus className="w-4 h-4" /> } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
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
            <span className="flex-1">Customer</span>
            <span className="hidden md:block w-44">Contact</span>
            <span className="hidden md:block w-20 text-right">Billed</span>
            <span className="hidden md:block w-24 text-right">Outstanding</span>
            <span className="w-16 text-right">Status</span>
            <span className="w-8" />
          </div>

          <div className="divide-y divide-border/60">
            {filtered.map((customer) => {
              const s = stats[customer.id];
              const checked = selected.has(customer.id);
              return (
                <div
                  key={customer.id}
                  onClick={() => router.push(`/customers/${customer.id}`)}
                  // Prefetch the detail RSC on hover so the click lands on a
                  // warm payload instead of a cold dynamic fetch.
                  onMouseEnter={() => router.prefetch(`/customers/${customer.id}`)}
                  className="group flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${customer.name}`}
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(customer.id);
                      else next.add(customer.id);
                      setSelected(next);
                    }}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <KireiAvatar name={customer.name} size={40} />
                  <div className="flex-1 min-w-[140px] basis-0">
                    <div className="font-semibold break-words">{customer.name}</div>
                    {customer.company && (
                      <div className="text-xs text-muted-foreground break-words inline-flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> {customer.company}
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block w-44 min-w-0 text-xs text-muted-foreground space-y-0.5">
                    {customer.email && (
                      <div className="break-words inline-flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" /> {customer.email}</div>
                    )}
                    {customer.phone && (
                      <div className="break-words inline-flex items-center gap-1.5"><Phone className="w-3 h-3 shrink-0" /> {customer.phone}</div>
                    )}
                  </div>
                  <div className="hidden md:block w-20 text-right text-sm tabular-nums">
                    {s?.total_billed ? formatCurrency(s.total_billed, currency) : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="hidden md:block w-24 text-right text-sm tabular-nums">
                    {s?.outstanding ? <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(s.outstanding, currency)}</span> : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="ml-auto text-right">
                    <KireiPill tone={customer.archived ? "archived" : "active"} />
                  </div>
                  <div className="w-8 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
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
                    <ChevronRight className="hidden md:inline-block w-4 h-4 text-muted-foreground/40 ml-1 group-hover:text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
