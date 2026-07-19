import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Coerce a value that *should* be a number but may not be.
 *
 * Postgres `numeric` columns arrive from PostgREST as STRINGS. The TypeScript
 * types say `number`, so nothing warns you — and `+` then concatenates instead
 * of adding: `0 + "500.00" + "250.00"` is `"0500.00250.00"`, which
 * formatCurrency turns into `$NaN`.
 *
 * The reason this survives code review and shipping: it renders correctly with
 * zero or one row and only breaks at two or more. Note that `-` coerces, so
 * subtracting totals looks fine while summing them does not — which is why
 * "outstanding" was right on the same screen where "paid" was NaN.
 *
 * Use this on any money column read from the database before doing arithmetic.
 */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/** Sum a money column across rows, coercing each value. */
export function sumMoney<T>(rows: T[], pick: (row: T) => unknown): number {
  return rows.reduce<number>((s, r) => s + num(pick(r)), 0);
}

export function formatCurrency(amount: number, currency = "GBP", locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, formatStr = "dd MMM yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
    accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    expired: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    partial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return map[status] ?? "bg-zinc-100 text-zinc-700";
}

export function isOverdue(dueDate: string, status: string): boolean {
  if (status === "paid" || status === "cancelled") return false;
  return new Date(dueDate) < new Date();
}
