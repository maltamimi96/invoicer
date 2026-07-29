"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Package, ClipboardPaste, ChevronDown } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { MyobInput } from "@/components/ui/myob/myob-input";
import { MyobNumberInput } from "@/components/ui/myob/myob-number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, formatCurrency } from "@/lib/utils";
import type { LineItem, Product, Material } from "@/types/database";
import { v4 as uuidv4 } from "uuid";
import { LineItemsImportModal } from "./line-items-import-modal";

interface LineItemsEditorProps {
  items: LineItem[];
  products: Product[];
  materials?: Material[];
  onChange: (items: LineItem[]) => void;
  currency?: string;
}

type LayoutMode = "items" | "services";

/** Recompute the derived fields on a line whenever an input changes. */
function calcItem(item: Omit<LineItem, "subtotal" | "tax_amount" | "total">): LineItem {
  const subtotal = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
  const tax_amount = (subtotal * item.tax_rate) / 100;
  return { ...item, subtotal, tax_amount, total: subtotal + tax_amount };
}

// Full literal class strings (incl. the md: prefix) so Tailwind's source
// scanner generates them — never build these dynamically.
const ITEMS_HEAD = "md:grid-cols-[minmax(200px,1fr)_88px_120px_76px_92px_112px_36px]";
const SERVICES_HEAD = "md:grid-cols-[minmax(320px,1fr)_140px_92px_36px]";
const ITEMS_ROW = "grid-cols-1 md:grid-cols-[minmax(200px,1fr)_88px_120px_76px_92px_112px_36px]";
const SERVICES_ROW = "grid-cols-1 md:grid-cols-[minmax(320px,1fr)_140px_92px_36px]";

export function LineItemsEditor({ items, products, materials = [], onChange, currency = "GBP" }: LineItemsEditorProps) {
  const [layout, setLayout] = useState<LayoutMode>("items");
  const [importOpen, setImportOpen] = useState(false);

  const blankItem = (): LineItem =>
    calcItem({ id: uuidv4(), name: "", description: "", quantity: 1, unit_price: 0, tax_rate: 20, discount_percent: 0 });

  const addItem = () => onChange([...items, blankItem()]);

  const patchItem = (index: number, patch: Partial<LineItem>) => {
    const updated = [...items];
    updated[index] = calcItem({ ...updated[index], ...patch });
    onChange(updated);
  };

  const fillFromProduct = (index: number, p: Product) =>
    patchItem(index, { product_id: p.id, name: p.name, description: p.description ?? "", unit_price: p.unit_price ?? 0, tax_rate: p.tax_rate ?? 20 });

  const fillFromMaterial = (index: number, m: Material) =>
    patchItem(index, { product_id: undefined, name: m.name, description: m.description ?? "", unit_price: m.sell_price ?? 0, tax_rate: m.tax_rate ?? 20 });

  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {/* Field-layout switcher (MYOB) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Line items</p>
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
          {(["items", "services"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLayout(mode)}
              className={cn(
                "rounded-[6px] px-3 py-1 font-medium capitalize transition-colors",
                layout === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Header row (desktop) */}
      <div className={cn("hidden md:grid items-center gap-2 px-2 pb-1", layout === "items" ? ITEMS_HEAD : SERVICES_HEAD)}>
        {(layout === "items"
          ? ["Item", "Qty", "Unit price", "Disc %", "Tax %", "Amount", ""]
          : ["Description", "Amount", "Tax %", ""]
        ).map((h, i, arr) => (
          <p
            key={h || `sp-${i}`}
            className={cn(
              "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
              i > 0 && i < arr.length - 1 && "text-right",
            )}
          >
            {h}
          </p>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "group grid items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/40 md:min-h-[52px]",
                  layout === "items" ? ITEMS_ROW : SERVICES_ROW,
                )}
              >
                {/* Item / description cell */}
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <MyobInput
                      value={item.name}
                      onChange={(e) => patchItem(index, { name: e.target.value })}
                      placeholder={layout === "services" ? "Describe the service…" : "Item name"}
                      className="h-8 border-0 bg-transparent px-1 font-medium focus-visible:ring-0"
                    />
                    {layout === "items" && (
                      <MyobInput
                        value={item.description ?? ""}
                        onChange={(e) => patchItem(index, { description: e.target.value })}
                        placeholder="Description (optional)"
                        className="h-7 border-0 bg-transparent px-1 text-[13px] text-muted-foreground focus-visible:ring-0"
                      />
                    )}
                  </div>
                  <RowPicker
                    products={products}
                    materials={materials}
                    currency={currency}
                    onPickProduct={(p) => fillFromProduct(index, p)}
                    onPickMaterial={(m) => fillFromMaterial(index, m)}
                  />
                </div>

                {layout === "items" ? (
                  <>
                    <MyobNumberInput bare value={item.quantity} onValueChange={(v) => patchItem(index, { quantity: v })} className="text-right tabular-nums" />
                    <MyobNumberInput bare decimals={2} value={item.unit_price} onValueChange={(v) => patchItem(index, { unit_price: v })} className="text-right tabular-nums" />
                    <MyobNumberInput bare value={item.discount_percent} onValueChange={(v) => patchItem(index, { discount_percent: v })} className="text-right tabular-nums" />
                    <MyobNumberInput bare value={item.tax_rate} onValueChange={(v) => patchItem(index, { tax_rate: v })} className="text-right tabular-nums" />
                    <span className="text-right text-sm font-medium tabular-nums">{formatCurrency(item.subtotal, currency)}</span>
                  </>
                ) : (
                  <>
                    <MyobNumberInput
                      bare
                      decimals={2}
                      value={item.subtotal}
                      onValueChange={(v) => patchItem(index, { unit_price: v, quantity: 1, discount_percent: 0 })}
                      className="text-right tabular-nums"
                    />
                    <MyobNumberInput bare value={item.tax_rate} onValueChange={(v) => patchItem(index, { tax_rate: v })} className="text-right tabular-nums" />
                  </>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 justify-self-end text-muted-foreground transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                  onClick={() => removeItem(index)}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add line + import */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setImportOpen(true)}>
          <ClipboardPaste className="h-3.5 w-3.5" /> Import / paste
        </Button>
      </div>

      <LineItemsImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(newItems) => onChange([...items, ...newItems])}
        currency={currency}
      />
    </div>
  );
}

/** In-cell catalog picker: fill this row from a product or material (MYOB item picker). */
function RowPicker({
  products,
  materials,
  currency,
  onPickProduct,
  onPickMaterial,
}: {
  products: Product[];
  materials: Material[];
  currency: string;
  onPickProduct: (p: Product) => void;
  onPickMaterial: (m: Material) => void;
}) {
  const [open, setOpen] = useState(false);
  if (products.length === 0 && materials.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Pick from catalog"
        >
          <Package className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search catalog…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {products.length > 0 && (
              <CommandGroup heading="Products">
                {products.map((p) => (
                  <CommandItem key={p.id} value={`p-${p.id}-${p.name}`} onSelect={() => { onPickProduct(p); setOpen(false); }}>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-muted-foreground">{formatCurrency(p.unit_price, currency)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {materials.length > 0 && (
              <CommandGroup heading="Materials">
                {materials.map((m) => (
                  <CommandItem key={m.id} value={`m-${m.id}-${m.name}`} onSelect={() => { onPickMaterial(m); setOpen(false); }}>
                    <span className="truncate">{m.name}</span>
                    <span className="ml-auto text-muted-foreground">{formatCurrency(m.sell_price, currency)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
