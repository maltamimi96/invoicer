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
import { deleteCustomer, updateCustomer, bulkImportCustomers } from "@/lib/actions/customers";
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

export function CustomersClient({ customers: initial }: { customers: Customer[] }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initial);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "archived" | "all">("active");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} onClick={() => router.push(`/customers/${customer.id}`)}>
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
              ))}
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
    </div>
  );
}
