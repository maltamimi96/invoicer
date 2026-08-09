/**
 * The expense category list, in one place.
 *
 * Both the expenses table and the recurring-cost scheduler write to the same
 * `expenses.category` column, so they have to offer the same words — two lists
 * that drift means "rent" in one place and "Rent" in the other, and a Spend-by-
 * category breakdown that reports them as different things.
 */

export const CATEGORY_GROUPS: { label: string; options: string[] }[] = [
  { label: "Job costs", options: ["materials", "subcontractor", "equipment-hire", "permits", "fuel", "vehicle", "travel", "tools"] },
  { label: "Overheads & bills", options: ["rent", "utilities", "insurance", "software", "subscriptions", "phone-internet", "marketing", "accounting", "bank-fees", "office", "tax"] },
  { label: "Payroll", options: ["wages", "superannuation"] },
  { label: "Other", options: ["other"] },
];

export const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.options);

export const catLabel = (c: string) => c.replace(/-/g, " ");
