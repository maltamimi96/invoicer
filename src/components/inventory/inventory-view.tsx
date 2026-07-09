"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Plus } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createStockItem, adjustStock } from "@/lib/actions/inventory";
import type { InventoryProduct, StockReason } from "@/types/database";

const money = (n: number | null) => n == null ? "—" : `$${Number(n).toFixed(2)}`;
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function InventoryView({ items }: { items: InventoryProduct[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<InventoryProduct | null>(null);

  // add-item form
  const [name, setName] = useState(""); const [unit, setUnit] = useState("");
  const [qty, setQty] = useState(""); const [reorder, setReorder] = useState("");
  const [cost, setCost] = useState(""); const [price, setPrice] = useState("");
  // adjust form
  const [delta, setDelta] = useState(""); const [reason, setReason] = useState<StockReason>("received"); const [note, setNote] = useState("");

  const lowStock = items.filter((p) => p.reorder_point != null && Number(p.stock_qty) <= Number(p.reorder_point));
  const stockValue = items.reduce((s, p) => s + Number(p.stock_qty) * Number(p.unit_cost ?? 0), 0);

  function handleAdd() {
    if (!name.trim()) { toast.error("Enter a name"); return; }
    startTransition(async () => {
      try {
        await createStockItem({ name, unit, stock_qty: qty, reorder_point: reorder || null, unit_cost: cost || null, unit_price: price });
        toast.success("Stock item added");
        setAddOpen(false); setName(""); setUnit(""); setQty(""); setReorder(""); setCost(""); setPrice("");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add"); }
    });
  }

  function openAdjust(p: InventoryProduct) { setAdjustFor(p); setDelta(""); setReason("received"); setNote(""); }
  function handleAdjust(sign: 1 | -1) {
    if (!adjustFor) return;
    const d = Number(delta);
    if (!d || d <= 0) { toast.error("Enter a quantity"); return; }
    startTransition(async () => {
      try {
        const r = await adjustStock({ product_id: adjustFor.id, delta: sign * d, reason, note });
        toast.success(`On hand: ${r.stock_qty}`);
        setAdjustFor(null); router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't adjust"); }
    });
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand, reorder points and usage"
        actions={<Button onClick={() => setAddOpen(true)} disabled={isPending}><Plus className="w-4 h-4 mr-1.5" /> Add stock item</Button>}
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Tracked items" value={String(items.length)} />
        <Stat label="Low stock" value={String(lowStock.length)} tone={lowStock.length ? "warn" : undefined} />
        <Stat label="Stock value" value={`$${stockValue.toFixed(2)}`} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center mb-3"><Boxes className="w-6 h-6 text-muted-foreground" /></div>
          <p className="font-semibold">No tracked stock yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add a stock item (or turn on tracking for a product) to track quantities and get low-stock alerts.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add stock item</Button>
        </div>
      ) : (
        <div className="ch-table-wrap">
          <table className="ch-table w-full">
            <thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Reorder at</th><th className="num">Unit cost</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => {
                const low = p.reorder_point != null && Number(p.stock_qty) <= Number(p.reorder_point);
                return (
                  <tr key={p.id}>
                    <td className="break-words">{p.name}{p.unit && <span className="text-muted-foreground"> / {p.unit}</span>}{low && <span className="ml-2 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">low</span>}</td>
                    <td className="num font-semibold">{Number(p.stock_qty)}</td>
                    <td className="num">{p.reorder_point ?? "—"}</td>
                    <td className="num">{money(p.unit_cost)}</td>
                    <td><button onClick={() => openAdjust(p)} className="text-xs text-primary hover:underline">Adjust</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add item */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add stock item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="i-name">Name</Label><Input id="i-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="i-unit">Unit</Label><Input id="i-unit" placeholder="ea, box, m…" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="i-qty">On hand</Label><Input id="i-qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label htmlFor="i-reorder">Reorder at</Label><Input id="i-reorder" type="number" step="0.01" value={reorder} onChange={(e) => setReorder(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="i-cost">Unit cost</Label><Input id="i-cost" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="i-price">Sell price</Label><Input id="i-price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleAdd} disabled={isPending}>Add item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust */}
      <Dialog open={!!adjustFor} onOpenChange={(o) => !o && setAdjustFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust stock — {adjustFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">On hand: <span className="font-semibold text-foreground">{Number(adjustFor?.stock_qty ?? 0)}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="a-qty">Quantity</Label><Input id="a-qty" type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="a-reason">Reason</Label>
                <select id="a-reason" className={selectCls} value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>
                  <option value="received">Received</option><option value="usage">Used on job</option><option value="count">Stock count</option><option value="adjustment">Adjustment</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="a-note">Note</Label><Input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleAdjust(-1)} disabled={isPending}>− Remove</Button>
            <Button onClick={() => handleAdjust(1)} disabled={isPending}>+ Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", tone === "warn" && "text-amber-600")}>{value}</p>
    </div>
  );
}
