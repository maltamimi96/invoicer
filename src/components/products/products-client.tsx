"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Package, Edit, Trash2, Upload } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { CleanupButton } from "@/components/cleanup/cleanup-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createProduct, updateProduct, deleteProduct, bulkImportProducts } from "@/lib/actions/products";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import { ProductForm } from "./product-form";
import { formatCurrency } from "@/lib/utils";
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

  const filtered = products.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  );

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

  const totalCatalogValue = products.reduce((s, p) => s + (p.unit_price ?? 0), 0);
  const archivedCount = products.filter((p) => p.archived).length;

  return (
    <div>
      <PageHeader
        title="Products & Services"
        subtitle={`${products.length - archivedCount} active · ${archivedCount} archived`}
        actions={
          <>
            <CleanupButton entity="products" entityLabel="products" />
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setShowImport(true)}
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add product
            </button>
          </>
        }
      />

      <div className="ch-stat-grid">
        <div className="ch-stat">
          <div className="ch-stat-label"><Package className="w-3.5 h-3.5" /><span>Total items</span></div>
          <div className="ch-stat-value">{products.length}</div>
          <div className="ch-stat-meta">in catalog</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Package className="w-3.5 h-3.5" /><span>Catalog value</span></div>
          <div className="ch-stat-value">{formatCurrency(totalCatalogValue, currency)}</div>
          <div className="ch-stat-meta">sum of unit prices</div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat-label"><Package className="w-3.5 h-3.5" /><span>Active</span></div>
          <div className="ch-stat-value">{products.length - archivedCount}</div>
          <div className="ch-stat-meta">available to invoice</div>
        </div>
      </div>

      <div className="ch-filter-bar">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-9 h-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ch-empty">
          <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h4>No products found</h4>
          <p>{search ? "Try a different search." : "Add your products and services to quickly fill line items."}</p>
          {!search && (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-3 h-3" /> Add product
            </button>
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
                <th>Product</th>
                <th>Unit</th>
                <th>Tax</th>
                <th>Status</th>
                <th className="num">Unit price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((product) => (
                  <tr key={product.id} onClick={() => setEditProduct(product)}>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{product.name}</div>
                          {product.description && (
                            <div className="text-[11.5px] text-muted-foreground truncate max-w-md">{product.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{product.unit ?? "—"}</td>
                    <td className="text-muted-foreground">{product.tax_rate}%</td>
                    <td>
                      <span className={`ch-pill ${product.archived ? "archived" : "active"}`}>
                        {product.archived ? "archived" : "active"}
                      </span>
                    </td>
                    <td className="num font-semibold">{formatCurrency(product.unit_price, currency)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted" onClick={() => setEditProduct(product)}>
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => setDeleteId(product.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>
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
