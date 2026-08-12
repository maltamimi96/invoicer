"use client";

import { useState } from "react";
import { Plus, Search, Package, Edit, Trash2, Upload, DollarSign, CheckCircle } from "@/components/ui/icons";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createMaterial, updateMaterial, deleteMaterial, bulkImportMaterials, bulkDeleteMaterials } from "@/lib/actions/materials";
import { BulkImportModal } from "@/components/shared/bulk-import-modal";
import { BulkBar } from "@/components/shared/bulk-bar";
import { useConfirm } from "@/components/ui/confirm";
import { MaterialForm } from "./material-form";
import { formatCurrency, sumMoney } from "@/lib/utils";
import {
  StatTile, KireiPill, EmptyState, AnimatedPress, FadeIn, GradientTile,
} from "@/components/ui/kirei";
import type { Material } from "@/types/database";

const MATERIAL_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "cost_price", label: "Base Cost", required: true, type: "number" as const },
  { key: "sell_price", label: "Sell Price", type: "number" as const },
  { key: "tax_rate", label: "Tax Rate (%)", type: "number" as const },
  { key: "description", label: "Description" },
  { key: "sku", label: "SKU" },
  { key: "supplier", label: "Supplier" },
  { key: "unit", label: "Unit" },
];

type FormValues = { name: string; cost_price: number; sell_price: number; tax_rate: number; description?: string; sku?: string; supplier?: string; unit?: string; archived: boolean };

export function MaterialsClient({ materials: initial, currency = "GBP" }: { materials: Material[]; currency?: string }) {
  const [materials, setMaterials] = useState(initial);
  const [search, setSearch] = useState("");
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const confirm = useConfirm();

  const filtered = materials.filter((m) =>
    `${m.name} ${m.description ?? ""} ${m.sku ?? ""} ${m.supplier ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((m) => m.id)));

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!(await confirm({ title: `Delete ${ids.length} material${ids.length === 1 ? "" : "s"}?`, body: "This removes them from your cost catalog. Quotes and invoices are unaffected." }))) return;
    setBulkBusy(true);
    try {
      await bulkDeleteMaterials(ids);
      setMaterials((prev) => prev.filter((m) => !selected.has(m.id)));
      setSelected(new Set());
      toast.success(`${ids.length} material${ids.length === 1 ? "" : "s"} deleted`);
    } catch { toast.error("Failed to delete"); }
    setBulkBusy(false);
  };

  const handleCreate = async (data: FormValues) => {
    try {
      const material = await createMaterial({
        name: data.name,
        cost_price: data.cost_price,
        sell_price: data.sell_price,
        tax_rate: data.tax_rate,
        description: data.description ?? null,
        sku: data.sku ?? null,
        supplier: data.supplier ?? null,
        unit: data.unit ?? null,
        archived: data.archived,
      });
      setMaterials((prev) => [...prev, material]);
      setShowNew(false);
      toast.success("Material added");
    } catch { toast.error("Failed to add material"); }
  };

  const handleUpdate = async (data: Partial<FormValues>) => {
    if (!editMaterial) return;
    try {
      const updated = await updateMaterial(editMaterial.id, {
        ...data,
        description: data.description ?? null,
        sku: data.sku ?? null,
        supplier: data.supplier ?? null,
        unit: data.unit ?? null,
      });
      setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditMaterial(null);
      toast.success("Material updated");
    } catch { toast.error("Failed to update material"); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMaterial(deleteId);
      setMaterials((prev) => prev.filter((m) => m.id !== deleteId));
      toast.success("Material deleted");
    } catch { toast.error("Failed to delete"); }
    setDeleteId(null);
  };

  // sumMoney coerces the string PostgREST returns for numeric columns, so this
  // total is the real sum of cost prices, not a $NaN concatenation.
  const totalCatalogCost = sumMoney(materials, (m) => m.cost_price);
  const archivedCount = materials.filter((m) => m.archived).length;
  const activeCount = materials.length - archivedCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materials"
        subtitle={`${activeCount} active · ${archivedCount} archived · cost reference catalog`}
        actions={
          <>
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
              <Plus className="w-4 h-4" /> Add material
            </AnimatedPress>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <FadeIn delay={60}><StatTile gradient="softAmber" tone="warn" icon={<Package     className="w-3.5 h-3.5" />} label="Total items"  value={String(materials.length)}                  sub="in catalog" /></FadeIn>
        <FadeIn delay={110}><StatTile gradient="softAmber" tone="warn" icon={<DollarSign  className="w-3.5 h-3.5" />} label="Total cost"   value={formatCurrency(totalCatalogCost, currency)} sub="sum of cost prices" /></FadeIn>
        <FadeIn delay={160}><StatTile gradient="softTeal"  tone="ok" icon={<CheckCircle className="w-3.5 h-3.5" />} label="Active"       value={String(activeCount)}                        sub="materials on file" /></FadeIn>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-9 h-10 rounded-xl" placeholder="Search materials…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <BulkBar count={selected.size} noun="material" busy={bulkBusy} onDelete={handleBulkDelete} onClear={() => setSelected(new Set())} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          gradient="amber"
          title={search ? "No matches" : "No materials yet"}
          hint={search ? "Try a different search." : "Build a catalog of your material costs to use as a reference when pricing jobs."}
          cta={!search ? { label: "Add material", href: "#", icon: <Plus className="w-4 h-4" /> } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 cursor-pointer shrink-0" aria-label="Select all" />
            <span className="flex-1">Material</span>
            <span className="hidden md:block w-24">Supplier</span>
            <span className="hidden md:block w-20">Unit</span>
            <span className="hidden md:block w-16 text-right">Tax</span>
            <span className="hidden sm:block w-24 text-right">Status</span>
            <span className="hidden sm:block w-20 text-right">Base</span>
            <span className="w-24 text-right">Sell</span>
            <span className="w-16" />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((material) => (
              <div
                key={material.id}
                onClick={() => setEditMaterial(material)}
                className="group flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40"
              >
                <input type="checkbox" checked={selected.has(material.id)} onChange={() => toggle(material.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 cursor-pointer shrink-0" aria-label="Select material" />
                <GradientTile gradient="amber" size={40} radius={10}>
                  <Package className="w-4 h-4" />
                </GradientTile>
                <div className="flex-1 min-w-[140px] basis-0">
                  <div className="text-sm font-semibold break-words">{material.name}</div>
                  {(material.description || material.sku) && (
                    <div className="text-xs text-muted-foreground break-words max-w-md">
                      {material.sku ? `${material.sku}${material.description ? " · " : ""}` : ""}{material.description}
                    </div>
                  )}
                </div>
                <div className="hidden md:block w-24 text-xs text-muted-foreground break-words">{material.supplier ?? "—"}</div>
                <div className="hidden md:block w-20 text-xs text-muted-foreground break-words">{material.unit ?? "—"}</div>
                <div className="hidden md:block w-16 text-right text-xs text-muted-foreground">{material.tax_rate}%</div>
                <div className="ml-auto md:ml-0 hidden sm:block md:w-24 text-right">
                  <KireiPill tone={material.archived ? "archived" : "active"} />
                </div>
                <div className="hidden sm:block md:w-20 text-right text-xs text-muted-foreground tabular-nums">{formatCurrency(material.cost_price, currency)}</div>
                <div className="ml-auto sm:ml-0 md:w-24 text-right text-sm font-semibold tabular-nums">{formatCurrency(material.sell_price, currency)}</div>
                <div className="w-16 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEditMaterial(material)}>
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => setDeleteId(material.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={showNew} onOpenChange={setShowNew}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>New material</SheetTitle></SheetHeader>
          <div className="mt-6">
            <MaterialForm onSubmit={handleCreate} onCancel={() => setShowNew(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!editMaterial} onOpenChange={(o) => !o && setEditMaterial(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit material</SheetTitle></SheetHeader>
          <div className="mt-6">
            {editMaterial && <MaterialForm material={editMaterial} onSubmit={handleUpdate} onCancel={() => setEditMaterial(null)} />}
          </div>
        </SheetContent>
      </Sheet>

      <BulkImportModal
        open={showImport}
        onOpenChange={setShowImport}
        title="Import materials"
        columns={MATERIAL_COLUMNS}
        onImport={(rows) => bulkImportMaterials(rows as Parameters<typeof bulkImportMaterials>[0])}
        onSuccess={(count) => {
          toast.success(`${count} material${count !== 1 ? "s" : ""} imported`);
          window.location.reload();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete material?</AlertDialogTitle>
            <AlertDialogDescription>This removes it from your cost catalog. Quotes and invoices are unaffected.</AlertDialogDescription>
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
