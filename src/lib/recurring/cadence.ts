import type { RecurringJobCadence } from "@/types/database";

export function advanceOccurrence(current: string, cadence: RecurringJobCadence): string {
  const d = new Date(current + "T00:00:00");
  switch (cadence) {
    case "weekly":      d.setDate(d.getDate() + 7); break;
    case "fortnightly": d.setDate(d.getDate() + 14); break;
    case "monthly":     d.setMonth(d.getMonth() + 1); break;
    case "quarterly":   d.setMonth(d.getMonth() + 3); break;
  }
  return d.toISOString().split("T")[0];
}
