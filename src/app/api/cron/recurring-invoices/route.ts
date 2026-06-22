/**
 * GET /api/cron/recurring-invoices
 *
 * Runs daily. For each active recurring-invoice schedule whose next_run_on has
 * arrived (catching up any missed days), generates an invoice from the saved
 * line items and either auto-charges the customer's saved card or emails it with
 * a pay link. Advances next_run_on by the cadence; deactivates past ends_on.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceOccurrence } from "@/lib/recurring/cadence";
import { generateRecurringInvoice } from "@/lib/recurring/generate-invoice";
import type { RecurringInvoice, LineItem } from "@/types/database";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sb = createAdminClient();
  const today = todayISO();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schedules } = await (sb as any)
    .from("recurring_invoices")
    .select("*")
    .eq("active", true)
    .lte("next_run_on", today);

  const items = (schedules ?? []) as RecurringInvoice[];
  const results: Array<{ id: string; generated: number; next: string | null; charged: number; stopped?: boolean }> = [];

  for (const r of items) {
    let runOn = r.next_run_on;
    let generated = 0;
    let charged = 0;
    let stopped = false;

    // Catch up any missed cycles (cap to avoid runaway).
    while (generated < 6 && runOn <= today) {
      if (r.ends_on && runOn > r.ends_on) { stopped = true; break; }
      try {
        const res = await generateRecurringInvoice(sb, {
          businessId: r.business_id,
          userId: r.user_id,
          customerId: r.customer_id,
          lineItems: (r.line_items ?? []) as LineItem[],
          subtotal: Number(r.subtotal), taxTotal: Number(r.tax_total), total: Number(r.total),
          dueDays: r.due_days ?? 14,
          notes: r.notes, terms: r.terms,
          autoCharge: r.auto_charge, sendEmail: r.send_email,
        });
        generated++;
        if (res.charged) charged++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("recurring_invoices").update({ last_invoice_id: res.invoiceId }).eq("id", r.id);
      } catch (err) {
        console.error("[cron.recurring-invoices] generate failed", r.id, err);
        break; // leave next_run_on as-is so it retries next run
      }
      runOn = advanceOccurrence(runOn, r.cadence);
      if (r.ends_on && runOn > r.ends_on) { stopped = true; break; }
    }

    if (generated > 0 || stopped) {
      const update: Record<string, unknown> = { next_run_on: runOn, last_run_at: new Date().toISOString() };
      if (stopped) update.active = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("recurring_invoices").update(update).eq("id", r.id);
    }

    results.push({ id: r.id, generated, charged, next: runOn, ...(stopped ? { stopped: true } : {}) });
  }

  return NextResponse.json({ ok: true, today, processed: results.length, results });
}
