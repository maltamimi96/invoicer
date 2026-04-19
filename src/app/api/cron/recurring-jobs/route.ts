/**
 * GET /api/cron/recurring-jobs
 *
 * Runs daily. For each active recurring schedule whose
 * next_occurrence_at falls within `generate_days_ahead`, materializes
 * a work order on that date and advances next_occurrence_at by the
 * configured cadence. Stops once next_occurrence_at passes ends_on.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceOccurrence } from "@/lib/recurring/cadence";
import type { RecurringJob } from "@/types/database";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function endTimeFromStart(start: string | null, durationMinutes: number | null): string | null {
  if (!start || !durationMinutes) return null;
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
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
    .from("recurring_jobs")
    .select("*")
    .eq("active", true);

  const items = (schedules ?? []) as RecurringJob[];
  const results: Array<{ id: string; generated: number; next: string | null; stopped?: boolean }> = [];

  for (const r of items) {
    let occ = r.next_occurrence_at;
    let generated = 0;
    let stopped = false;

    // Generate every occurrence whose date <= today + generate_days_ahead,
    // catching up if the cron missed a day. Cap at 8 to avoid runaway loops.
    while (generated < 8) {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + r.generate_days_ahead);
      const horizonISO = horizon.toISOString().split("T")[0];
      if (occ > horizonISO) break;
      if (r.ends_on && occ > r.ends_on) { stopped = true; break; }

      // Mint WO number
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: biz } = await (sb as any).from("businesses")
        .select("work_order_prefix, work_order_next_number").eq("id", r.business_id).single();
      const number = `${biz?.work_order_prefix ?? "WO"}-${String(biz?.work_order_next_number ?? 1).padStart(4, "0")}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("businesses")
        .update({ work_order_next_number: (biz?.work_order_next_number ?? 1) + 1 })
        .eq("id", r.business_id);

      const status = r.member_profile_ids.length > 0 ? "assigned" : "draft";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wo } = await (sb as any).from("work_orders").insert({
        business_id: r.business_id,
        user_id: r.user_id,
        number,
        title: r.title,
        description: r.description,
        customer_id: r.customer_id,
        site_id: r.site_id,
        property_address: r.property_address,
        reported_issue: r.reported_issue,
        scheduled_date: occ,
        start_time: r.preferred_start_time,
        end_time: endTimeFromStart(r.preferred_start_time, r.preferred_duration_minutes),
        status,
        photos: [],
        cc_contact_ids: [],
        recurring_job_id: r.id,
      }).select("id").single();

      if (wo && r.member_profile_ids.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("work_order_assignments").insert(
          r.member_profile_ids.map((pid) => ({
            work_order_id: wo.id,
            business_id: r.business_id,
            member_profile_id: pid,
            assigned_by: r.user_id,
          }))
        );
      }

      generated++;
      occ = advanceOccurrence(occ, r.cadence);
      if (r.ends_on && occ > r.ends_on) { stopped = true; break; }
    }

    if (generated > 0 || stopped) {
      const update: Record<string, unknown> = {
        next_occurrence_at: occ,
        last_generated_at: new Date().toISOString(),
      };
      if (stopped) update.active = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("recurring_jobs").update(update).eq("id", r.id);
    }

    results.push({ id: r.id, generated, next: occ, ...(stopped ? { stopped: true } : {}) });
  }

  return NextResponse.json({ ok: true, today, processed: results.length, results });
}
