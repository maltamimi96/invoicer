"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, Package, ClipboardPaste } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";
import type { LineItem, Product } from "@/types/database";
import { v4 as uuidv4 } from "uuid";
import { LineItemsImportModal } from "./line-items-import-modal";

interface LineItemsEditorProps {
  items: LineItem[];
  products: Product[];
  onChange: (items: LineItem[]) => void;
  currency?: string;
}

function calcItem(item: Omit<LineItem, "subtotal" | "tax_amount" | "total">): LineItem {
  const subtotal = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
  const tax_amount = (subtotal * item.tax_rate) / 100;
  return { ...item, subtotal, tax_amount, total: subtotal + tax_amount };
}

export function LineItemsEditor({ items, products, onChange, currency = "GBP" }: LineItemsEditorProps) {
  const [productSearch, setProductSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const addItem = (product?: Product) => {
    const newItem = calcItem({
      id: uuidv4(),
      product_id: product?.id,
      name: product?.name ?? "",
      description: product?.description ?? "",
      quantity: 1,
      unit_price: product?.unit_price ?? 0,
      tax_rate: product?.tax_rate ?? 20,
      discount_percent: 0,
    });
    onChange([...items, newItem]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
    updated[index] = calcItem(item);
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const filteredProducts = products.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[1fr_80px_100px_80px_80px_36px] gap-2 px-1">
        {["Item", "Qty", "Price", "Tax %", "Total", ""].map((h) => (
          <p key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</p>
        ))}
      </div>

      {/* Items */}
      {items.map((item, index) => (
        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_80px_100px_80px_80px_36px] gap-2 p-3 md:p-0 rounded-lg border md:border-0 bg-muted/30 md:bg-transparent">
          <div className="space-y-1">
            <Input
              placeholder="Item name"
              value={item.name}
              onChange={(e) => updateItem(index, "name", e.target.value)}
              className="font-medium"
            />
            <Input
              placeholder="Description (optional)"
              value={item.description ?? ""}
              onChange={(e) => updateItem(index, "description", e.target.value)}
              className="text-sm text-muted-foreground"
            />
          </div>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="1"
            value={item.quantity}
            onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
            className="text-center"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={item.unit_price}
            onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
          />
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="20"
            value={item.tax_rate}
            onChange={(e) => updateItem(index, "tax_rate", parseFloat(e.target.value) || 0)}
          />
          <div className="flex items-center">
            <span className="text-sm font-medium w-full text-right pr-1">{formatCurrency(item.total, currency)}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(index)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => addItem()}>
          <Plus className="w-3.5 h-3.5" /> Add item
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
          <ClipboardPaste className="w-3.5 h-3.5" /> Import / paste
        </Button>

        {products.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <Package className="w-3.5 h-3.5" /> From catalog
                <ChevronDown className="w-3 h-3 ml-1 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="mb-2 h-8 text-sm"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm"
                    onClick={() => addItem(p)}
                  >
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">{formatCurrency(p.unit_price, currency)}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No products found</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
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
