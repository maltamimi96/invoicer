/**
 * GET /api/cron/recurring-expenses
 *
 * Posts the costs that arrive whether anyone remembers them: rent, insurance,
 * subscriptions. Runs daily; multi-tenant from the start, unlike the reminders
 * cron which had one business id baked in.
 *
 * Catches up rather than skipping: if the runner was down for a week, every
 * missed occurrence is posted on its own date, so the books show the rent in
 * the month it was actually due. Bounded at 12 per schedule so a long-stale
 * row can't post years of history in one go.
 *
 * Duplicate-safe at the DATABASE, not here: a unique index on
 * (recurring_expense_id, spent_on) means a retry or an overlapping run cannot
 * post the rent twice. A duplicate cost is a wrong profit figure, silently.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { dueDatesUpTo, type ExpenseCadence } from "@/lib/recurring/expense-schedule";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schedules, error } = await (sb as any)
    .from("recurring_expenses")
    .select("*")
    .eq("active", true)
    .lte("next_run_on", today)
    .limit(500);
  if (error) {
    console.error("[recurring-expenses] load failed", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let posted = 0, skipped = 0, ended = 0;

  for (const sch of (schedules ?? []) as Array<Record<string, unknown>>) {
    const cadence = String(sch.cadence) as ExpenseCadence;
    const endsOn = sch.ends_on ? String(sch.ends_on) : null;
    const day = sch.preferred_day_of_month as number | null;

    const due = dueDatesUpTo(String(sch.next_run_on), today, cadence, day)
      .filter((d) => !endsOn || d <= endsOn);

    for (const spentOn of due) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (sb as any).from("expenses").insert({
        business_id: sch.business_id,
        user_id: sch.user_id,
        recurring_expense_id: sch.id,
        vendor: sch.vendor,
        category: sch.category,
        description: sch.description ?? sch.name,
        amount: sch.amount,
        tax_amount: sch.tax_amount,
        spent_on: spentOn,
        payment_method: sch.payment_method,
        billable: sch.billable,
        status: "recorded",
      });
      if (insErr) {
        // 23505 = the unique index did its job; this occurrence already
        // exists. Not an error, and not a reason to stop the schedule.
        if (insErr.code === "23505") { skipped++; continue; }
        console.error("[recurring-expenses] insert failed", sch.id, spentOn, insErr.message);
        continue;
      }
      posted++;
    }

    // Advance past everything just handled, even the duplicates — otherwise a
    // schedule that hit the unique index would retry the same date forever.
    let nextRun = String(sch.next_run_on);
    const { nextDueDate } = await import("@/lib/recurring/expense-schedule");
    while (nextRun <= today) nextRun = nextDueDate(nextRun, cadence, day);

    const finished = Boolean(endsOn && nextRun > endsOn);
    if (finished) ended++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("recurring_expenses").update({
      next_run_on: nextRun,
      last_run_at: new Date().toISOString(),
      ...(finished ? { active: false } : {}),
    }).eq("id", sch.id);
  }

  return NextResponse.json({
    ok: true, date: today,
    schedules: (schedules ?? []).length, posted, skipped_duplicates: skipped, ended,
  });
}
