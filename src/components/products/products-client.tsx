"use client";

import { useState } from "react";
import { Plus, Search, Package, Edit, Trash2, Upload, DollarSign, CheckCircle } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createProduct, updateProduct, deleteProduct, bulkImportProducts, bulkDeleteProducts } from "@/lib/actions/products";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import { BulkBar } from "@/components/shared/bulk-bar";
import { useConfirm } from "@/components/ui/confirm";
import { ProductForm } from "./product-form";
import { formatCurrency, sumMoney } from "@/lib/utils";
import {
  StatTile, KireiPill, EmptyState, AnimatedPress, FadeIn, GradientTile,
} from "@/components/ui/kirei";
import type { Product } from "@/types/database";

const PRODUCT_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "unit_price", label: "Unit Price", required: true, type: "number" as const },
  { key: "tax_rate", label: "Tax Rate (%)", type: "number" as const },
  { key: "description", label: "Description" },
  { key: "unit", label: "Unit" },
];

export function ProductsClient({ products: initial, currency = "GBP" }: { products: Product[]; currency?: string }) {
  const [products, setProducts] = useState(initial);
  const [search, setSearch] = useState("");
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const confirm = useConfirm();

  const filtered = products.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((p) => p.id)));

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!(await confirm({ title: `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}?`, body: "This can't be undone. Existing invoices and quotes are unaffected." }))) return;
    setBulkBusy(true);
    try {
      await bulkDeleteProducts(ids);
      setProducts((prev) => prev.filter((p) => !selected.has(p.id)));
      setSelected(new Set());
      toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} deleted`);
    } catch { toast.error("Failed to delete"); }
    setBulkBusy(false);
  };

  const handleCreate = async (data: { name: string; unit_price: number; tax_rate: number; description?: string; unit?: string; archived: boolean }) => {
    try {
      const product = await createProduct({
        name: data.name,
        unit_price: data.unit_price,
        tax_rate: data.tax_rate,
        description: data.description ?? null,
        unit: data.unit ?? null,
        archived: data.archived,
      });
      setProducts((prev) => [...prev, product]);
      setShowNew(false);
      toast.success("Product created");
    } catch { toast.error("Failed to create product"); }
  };

  const handleUpdate = async (data: { name?: string; unit_price?: number; tax_rate?: number; description?: string; unit?: string; archived?: boolean }) => {
    if (!editProduct) return;
    try {
      const updated = await updateProduct(editProduct.id, {
        ...data,
        description: data.description ?? null,
        unit: data.unit ?? null,
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditProduct(null);
      toast.success("Product updated");
    } catch { toast.error("Failed to update product"); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteProduct(deleteId);
      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      toast.success("Product deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
  };

  // `?? 0` guarded null but not the string PostgREST actually returns for a
  // numeric column, so this concatenated. Products is a default-on page, so
  // any business with two products saw $NaN.
  const totalCatalogValue = sumMoney(products, (p) => p.unit_price);
  const archivedCount = products.filter((p) => p.archived).length;
  const activeCount = products.length - archivedCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Services"
        subtitle={`${activeCount} active · ${archivedCount} archived`}
        accent="linear-gradient(180deg, #34d399 0%, #047857 100%)"
        actions={
          <>
            <CleanupButton entity="products" entityLabel="products" />
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setShowImport(true)}
            >
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <AnimatedPress
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add product
            </AnimatedPress>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <FadeIn delay={60}><StatTile gradient="softTeal"  tone="info" icon={<Package      className="w-3.5 h-3.5" />} label="Total items"   value={String(products.length)}                  sub="in catalog" /></FadeIn>
        <FadeIn delay={110}><StatTile gradient="softAmber" tone="warn" icon={<DollarSign   className="w-3.5 h-3.5" />} label="Catalog value" value={formatCurrency(totalCatalogValue, currency)} sub="sum of unit prices" /></FadeIn>
        <FadeIn delay={160}><StatTile gradient="softTeal"  tone="ok" icon={<CheckCircle  className="w-3.5 h-3.5" />} label="Active"        value={String(activeCount)}                       sub="available to invoice" /></FadeIn>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-9 h-10 rounded-xl" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <BulkBar count={selected.size} noun="product" busy={bulkBusy} onDelete={handleBulkDelete} onClear={() => setSelected(new Set())} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          gradient="emerald"
          title={search ? "No matches" : "No products yet"}
          hint={search ? "Try a different search." : "Add your products and services to quickly fill line items."}
          cta={!search ? { label: "Add product", href: "#", icon: <Plus className="w-4 h-4" /> } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 cursor-pointer shrink-0" aria-label="Select all" />
            <span className="flex-1">Product</span>
            <span className="hidden md:block w-20">Unit</span>
            <span className="hidden md:block w-16 text-right">Tax</span>
            <span className="w-24 text-right">Status</span>
            <span className="w-28 text-right">Unit price</span>
            <span className="w-16" />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((product) => (
              <div
                key={product.id}
                onClick={() => setEditProduct(product)}
                className="group flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 cursor-pointer shrink-0" aria-label="Select product" />
                <GradientTile gradient="emerald" size={40} radius={10}>
                  <Package className="w-4 h-4" />
                </GradientTile>
                <div className="flex-1 min-w-[140px] basis-0">
                  <div className="text-sm font-semibold break-words">{product.name}</div>
                  {product.description && (
                    <div className="text-xs text-muted-foreground break-words max-w-md">{product.description}</div>
                  )}
                </div>
                <div className="hidden md:block w-20 text-xs text-muted-foreground break-words">{product.unit ?? "—"}</div>
                <div className="hidden md:block w-16 text-right text-xs text-muted-foreground">{product.tax_rate}%</div>
                <div className="ml-auto md:ml-0 md:w-24 text-right">
                  <KireiPill tone={product.archived ? "archived" : "active"} />
                </div>
                <div className="md:w-28 text-right text-sm font-semibold tabular-nums">{formatCurrency(product.unit_price, currency)}</div>
                <div className="w-16 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEditProduct(product)}>
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => setDeleteId(product.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New product sheet */}
      <Sheet open={showNew} onOpenChange={setShowNew}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>New Product / Service</SheetTitle></SheetHeader>
          <div className="mt-6">
            <ProductForm onSubmit={handleCreate} onCancel={() => setShowNew(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit product sheet */}
      <Sheet open={!!editProduct} onOpenChange={(o) => !o && setEditProduct(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Product</SheetTitle></SheetHeader>
          <div className="mt-6">
            {editProduct && <ProductForm product={editProduct} onSubmit={handleUpdate} onCancel={() => setEditProduct(null)} />}
          </div>
        </SheetContent>
      </Sheet>

      <BulkImportModal
        open={showImport}
        onOpenChange={setShowImport}
        title="Import products"
        columns={PRODUCT_COLUMNS}
        onImport={(rows) => bulkImportProducts(rows as Parameters<typeof bulkImportProducts>[0])}
        onSuccess={(count) => {
          toast.success(`${count} product${count !== 1 ? "s" : ""} imported`);
          window.location.reload();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>This will not affect existing invoices or quotes.</AlertDialogDescription>
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
