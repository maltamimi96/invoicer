/**
 * GET /api/cron/automation-runs
 *
 * Runs every 2 minutes — see the schedule in vercel.json.
 *
 * Claims due automation_runs rows, executes each rule's actions in order, and
 * records what happened per action so a failure is readable in the UI rather
 * than only in a log nobody opens.
 *
 * The claim is a compare-and-set on status: pending → running, filtered by the
 * status we expected. Two overlapping invocations can't both take the same
 * row, which matters because these actions send email.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { sendOnboardingFormFor } from "@/lib/onboarding/send";
import { sendSmsFor, smsConfigured } from "@/lib/sms";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Give up after this many tries so a permanently broken rule stops retrying
 *  forever and starts showing as failed. */
const MAX_ATTEMPTS = 3;
/** Bounded per invocation: these send email, and a 300s budget is finite. */
const BATCH = 25;

interface ActionResult { type: string; ok: boolean; detail?: string }

/**
 * Does this entity match the rule's conditions?
 *
 * Conditions are plain field comparisons against the re-hydrated entity. An
 * unknown operator returns FALSE rather than true — a condition nobody
 * understands should stop the automation, not wave it through.
 */
function matches(entity: Record<string, unknown>, conditions: unknown): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((c) => {
    const cond = c as { field?: string; op?: string; value?: unknown };
    if (!cond?.field) return false;
    const actual = entity[cond.field];
    switch (cond.op) {
      case "eq":       return String(actual ?? "") === String(cond.value ?? "");
      case "neq":      return String(actual ?? "") !== String(cond.value ?? "");
      case "contains": return String(actual ?? "").toLowerCase().includes(String(cond.value ?? "").toLowerCase());
      case "set":      return actual !== null && actual !== undefined && actual !== "";
      case "not_set":  return actual === null || actual === undefined || actual === "";
      default:         return false;
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, businessId: string, entityId: string, action: any, entity: Record<string, any>,
): Promise<ActionResult> {
  const type = String(action?.type ?? "unknown");
  try {
    if (type === "send_sms") {
      if (!smsConfigured()) return { type, ok: false, detail: "SMS isn't configured on the server" };
      const to = String(entity.phone ?? "").trim();
      // Not a failure worth retrying: they simply have no number.
      if (!to) return { type, ok: true, detail: "Skipped — no phone number on record" };
      const body = String(action.message ?? "").replace(/\{\{name\}\}/g, String(entity.name ?? "there"));
      const res = await sendSmsFor(sb, businessId, {
        to, body, customerName: String(entity.name ?? "Customer"),
        customerId: entity.id && action.__entity === "customer" ? entity.id : null,
      });
      return { type, ok: true, detail: `Texted ${to} (${res.providerId})` };
    }
    if (type === "send_onboarding_form") {
      if (!action.form_id) return { type, ok: false, detail: "No form chosen on this action" };
      const res = await sendOnboardingFormFor(sb, businessId, action.form_id, entityId, { email: true });
      return res.ok
        ? { type, ok: true, detail: `Sent, request ${res.request_id}` }
        : { type, ok: false, detail: res.error };
    }
    return { type, ok: false, detail: `Unknown action "${type}"` };
  } catch (err) {
    return { type, ok: false, detail: err instanceof Error ? err.message : "Action failed" };
  }
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createAdminClient();
  const now = new Date().toISOString();

  const { data: due } = await tbl(sb, "automation_runs")
    .select("id, business_id, automation_id, entity_type, entity_id, attempt_count")
    .eq("status", "pending").lte("run_at", now)
    .order("run_at", { ascending: true }).limit(BATCH);

  let done = 0, failed = 0, skipped = 0;

  for (const run of due ?? []) {
    // Compare-and-set: only proceed if this invocation flipped it. Filtering
    // on the expected status is what stops two overlapping runs double-sending.
    const { data: claimed } = await tbl(sb, "automation_runs")
      .update({ status: "running", started_at: new Date().toISOString(), attempt_count: run.attempt_count + 1 })
      .eq("id", run.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;

    const finish = async (status: string, result: ActionResult[], error?: string) => {
      await tbl(sb, "automation_runs").update({
        status, result, error: error ?? null, finished_at: new Date().toISOString(),
      }).eq("id", run.id);
    };

    try {
      const { data: rule } = await tbl(sb, "automations")
        .select("id, enabled, conditions, actions").eq("id", run.automation_id).maybeSingle();

      // Disabled or deleted between queueing and running — not a failure.
      if (!rule?.enabled) { await finish("skipped", [], "Automation is switched off"); skipped++; continue; }

      const table = run.entity_type === "lead" ? "leads" : "customers";
      const { data: entity } = await tbl(sb, table)
        .select("*").eq("id", run.entity_id).eq("business_id", run.business_id).maybeSingle();
      // Deleted since. Skipping beats erroring on something that's simply gone.
      if (!entity) { await finish("skipped", [], "The record no longer exists"); skipped++; continue; }

      if (!matches(entity, rule.conditions)) {
        await finish("skipped", [], "Conditions didn't match"); skipped++; continue;
      }

      const results: ActionResult[] = [];
      for (const action of (rule.actions ?? [])) {
        results.push(await runAction(sb, run.business_id, run.entity_id,
          { ...action, __entity: run.entity_type }, entity));
      }

      const anyFailed = results.some((r) => !r.ok);
      if (anyFailed && run.attempt_count + 1 < MAX_ATTEMPTS) {
        // Back to pending for another go — a bounced provider call is often
        // transient, and the unique index means requeueing can't duplicate.
        await tbl(sb, "automation_runs").update({
          status: "pending", result: results, run_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }).eq("id", run.id);
        continue;
      }

      await finish(anyFailed ? "failed" : "done", results,
        anyFailed ? results.filter((r) => !r.ok).map((r) => r.detail).join("; ") : undefined);
      anyFailed ? failed++ : done++;

      await tbl(sb, "automations").update({
        last_run_at: new Date().toISOString(), run_count: (rule.run_count ?? 0) + 1,
      }).eq("id", rule.id);
    } catch (err) {
      await finish("failed", [], err instanceof Error ? err.message : "Run failed");
      failed++;
    }
  }

  return NextResponse.json({ ok: true, claimed: (due ?? []).length, done, failed, skipped });
}
