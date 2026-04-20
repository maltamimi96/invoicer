"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Package, Edit, Trash2, Archive, Upload } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products & Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{products.length} item{products.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button size="sm" variant="outline" className="gap-1.5 flex-1 sm:flex-initial" onClick={() => setShowImport(true)}>
            <Upload className="w-3.5 h-3.5" />Import CSV
          </Button>
          <Button size="sm" className="gap-1.5 flex-1 sm:flex-initial" onClick={() => setShowNew(true)}>
            <Plus className="w-3.5 h-3.5" />Add product
          </Button>
        </div>
      </motion.div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-medium mb-1">No products found</h3>
          <p className="text-sm text-muted-foreground mb-4">{search ? "Try a different search" : "Add your products and services to quickly fill line items"}</p>
          {!search && <Button size="sm" onClick={() => setShowNew(true)}>Add product</Button>}
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence>
            {filtered.map((product) => (
              <motion.div key={product.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                <Card>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{product.name}</span>
                        {product.unit && <Badge variant="outline" className="text-xs">{product.unit}</Badge>}
                        {product.archived && <Badge variant="secondary" className="text-xs">Archived</Badge>}
                      </div>
                      {product.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-sm">{formatCurrency(product.unit_price, currency)}</p>
                      <p className="text-xs text-muted-foreground">{product.tax_rate}% tax</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditProduct(product)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(product.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
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
