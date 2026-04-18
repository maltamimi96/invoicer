"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { JobTimelineEvent, JobTimelineEventType } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);
  return { supabase, user, businessId };
}

export async function getJobTimeline(workOrderId: string): Promise<JobTimelineEvent[]> {
  const { supabase, businessId } = await ctx();
  const { data, error } = await tbl(supabase, "job_timeline_events")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("business_id", businessId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data as JobTimelineEvent[];
}

export type LogEventInput = {
  workOrderId: string;
  type: JobTimelineEventType;
  payload?: Record<string, unknown>;
  visibleToCustomer?: boolean;
  actorLabel?: string;
  occurredAt?: string;
};

/**
 * Log a timeline event. Call from any action that touches a job.
 * Safe to fire-and-forget — failures are swallowed so they don't break the parent action.
 */
export async function logJobEvent(input: LogEventInput): Promise<void> {
  try {
    const { supabase, user, businessId } = await ctx();
    await tbl(supabase, "job_timeline_events").insert({
      business_id: businessId,
      work_order_id: input.workOrderId,
      type: input.type,
      actor_type: 'user',
      actor_id: user.id,
      actor_label: input.actorLabel ?? user.email ?? null,
      payload: input.payload ?? {},
      visible_to_customer: input.visibleToCustomer ?? false,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error("[logJobEvent]", e);
  }
}

/**
 * System-actor variant — for cron jobs, webhooks, or automation.
 */
export async function logJobEventSystem(opts: {
  businessId: string;
  workOrderId: string;
  type: JobTimelineEventType;
  payload?: Record<string, unknown>;
  visibleToCustomer?: boolean;
  actorLabel?: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await tbl(supabase, "job_timeline_events").insert({
      business_id: opts.businessId,
      work_order_id: opts.workOrderId,
      type: opts.type,
      actor_type: 'system',
      actor_label: opts.actorLabel ?? 'system',
      payload: opts.payload ?? {},
      visible_to_customer: opts.visibleToCustomer ?? false,
    });
  } catch (e) {
    console.error("[logJobEventSystem]", e);
  }
}

export async function addJobNote(workOrderId: string, content: string, visibleToCustomer = false) {
  await logJobEvent({
    workOrderId,
    type: 'note_added',
    payload: { content },
    visibleToCustomer,
  });
}
