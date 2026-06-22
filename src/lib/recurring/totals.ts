import type { LineItem } from "@/types/database";

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Sum a line-item array into {subtotal, tax_total, total}. */
export function totalsFromLineItems(items: LineItem[]): { subtotal: number; tax_total: number; total: number } {
  const r = (items ?? []).reduce(
    (acc, li) => {
      acc.subtotal += num(li.subtotal);
      acc.tax_total += num(li.tax_amount);
      acc.total += num(li.total);
      return acc;
    },
    { subtotal: 0, tax_total: 0, total: 0 },
  );
  return {
    subtotal: Math.round(r.subtotal * 100) / 100,
    tax_total: Math.round(r.tax_total * 100) / 100,
    total: Math.round(r.total * 100) / 100,
  };
}
