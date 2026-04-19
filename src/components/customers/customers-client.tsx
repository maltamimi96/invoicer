"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Search, Users, Mail, Phone, Building2, MoreHorizontal, Archive, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteCustomer, updateCustomer, bulkImportCustomers } from "@/lib/actions/customers";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import type { Customer } from "@/types/database";

const CUSTOMER_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "postcode", label: "Postcode" },
  { key: "country", label: "Country" },
  { key: "notes", label: "Notes" },
] as const;

export function CustomersClient({ customers: initial }: { customers: Customer[] }) {
  const [customers, setCustomers] = useState(initial);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const filtered = customers.filter((c) =>
    `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleArchive = async (id: string) => {
    try {
      await updateCustomer(id, { archived: true });
      setCustomers((prev) => prev.filter((c) => c.id !== id));
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button size="sm" variant="outline" className="gap-1.5 flex-1 sm:flex-initial" onClick={() => setShowImport(true)}>
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <Link href="/customers/new" className="flex-1 sm:flex-initial">
            <Button size="sm" className="gap-1.5 w-full sm:w-auto"><Plus className="w-3.5 h-3.5" /> Add customer</Button>
          </Link>
        </div>
      </motion.div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-medium mb-1">No customers found</h3>
          <p className="text-sm text-muted-foreground mb-4">{search ? "Try a different search" : "Add your first customer to get started"}</p>
          {!search && <Link href="/customers/new"><Button size="sm">Add customer</Button></Link>}
        </motion.div>
      ) : (
        <motion.div className="grid gap-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {filtered.map((customer) => (
            <motion.div key={customer.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium text-sm">
                        {customer.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <Link href={`/customers/${customer.id}`} className="font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {customer.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        {customer.company && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="w-3 h-3" />{customer.company}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" />{customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />{customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {customer.archived && <Badge variant="secondary" className="text-xs">Archived</Badge>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild><Link href={`/customers/${customer.id}`}>View details</Link></DropdownMenuItem>
                          <DropdownMenuItem asChild><Link href={`/invoices/new?customer=${customer.id}`}>New invoice</Link></DropdownMenuItem>
                          <DropdownMenuItem asChild><Link href={`/quotes/new?customer=${customer.id}`}>New quote</Link></DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleArchive(customer.id)} className="gap-2">
                            <Archive className="w-3.5 h-3.5" />Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteId(customer.id)} className="text-destructive gap-2">
                            <Trash2 className="w-3.5 h-3.5" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
