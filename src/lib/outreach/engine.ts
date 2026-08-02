/**
 * Outreach sequence engine — the multi-tenant port of the standalone
 * email-agent's sequencer.js.
 *
 * What changed in the port:
 *   · state.json            → outreach_enrollments (per business, RLS-scoped)
 *   · hardcoded 0/3/7/14    → per-step delay_days on a user-built sequence
 *   · hardcoded 100/run     → per-business daily_send_cap (+ per-campaign cap)
 *   · fire-any-time         → send window + send days, in the business's tz
 *   · stage + replied flag  → an outreach_messages row per send, tracked by the
 *                             Resend webhook (delivered/opened/clicked/bounced)
 *
 * Server-only. Called by the cron runner and by "send now" actions.
 */
import { randomBytes } from "node:crypto";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { appUrl } from "@/lib/app-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fill {{first_name}} / {{name}} / {{company}} / {{title}} / {{website}}. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeFields(tpl: string, p: any): string {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  return tpl.replace(/\{\{\s*(first_name|name|company|title|website)\s*\}\}/gi, (_m, k: string) => {
    switch (k.toLowerCase()) {
      case "first_name": return first;
      case "company": return String(p.company ?? "");
      case "title": return String(p.title ?? "");
      case "website": return String(p.website ?? "");
      default: return String(p.name ?? "there");
    }
  });
}

/** Is `now` inside the business's configured send window + days? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withinSendWindow(settings: any, now = new Date()): boolean {
  const tz = settings.timezone || "Australia/Sydney";
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[get("weekday")] ?? 1;
  const days: number[] = settings.send_days ?? [1, 2, 3, 4, 5];
  if (!days.includes(wd)) return false;

  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  const toMin = (t: string) => { const [h, m] = String(t).split(":"); return Number(h) * 60 + Number(m); };
  return mins >= toMin(settings.send_window_start ?? "08:00")
      && mins <= toMin(settings.send_window_end ?? "17:00");
}

export interface RunResult {
  sent: number; skipped: number; failed: number; completed: number;
  detail: { prospect: string; step: number; status: string }[];
}

/**
 * Send every enrollment that's due for this business, respecting caps, the
 * send window, and the suppression list. Advances or completes each one.
 */
export async function runOutreachForBusiness(
  sb: SB, businessId: string, opts: { ignoreWindow?: boolean; limit?: number } = {},
): Promise<RunResult> {
  const out: RunResult = { sent: 0, skipped: 0, failed: 0, completed: 0, detail: [] };

  const { data: settings } = await sb.from("outreach_settings").select("*").eq("business_id", businessId).maybeSingle();
  if (!settings?.enabled) return out;
  if (!opts.ignoreWindow && !withinSendWindow(settings)) return out;

  // Already sent today (business tz day boundary is close enough at UTC-day
  // granularity for a cap; the window check does the precise gating).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: sentToday } = await sb.from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId).gte("sent_at", since);

  const cap = Math.max(0, (settings.daily_send_cap ?? 50) - (sentToday ?? 0));
  const budget = Math.min(cap, opts.limit ?? cap);
  if (budget <= 0) return out;

  // Due enrollments, oldest first, only from running campaigns.
  const { data: due } = await sb.from("outreach_enrollments")
    .select("*, outreach_campaigns!inner(id,status,daily_cap), prospects!inner(id,name,email,company,title,website,status)")
    .eq("business_id", businessId)
    .eq("status", "active")
    .eq("outreach_campaigns.status", "running")
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(budget);

  if (!due?.length) return out;

  const [{ data: business }, { data: supp }] = await Promise.all([
    sb.from("businesses").select("name,email").eq("id", businessId).maybeSingle(),
    sb.from("prospect_suppressions").select("email").eq("business_id", businessId),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suppressed = new Set(((supp ?? []) as any[]).map((s) => String(s.email).toLowerCase()));
  const from = buildBusinessFrom({
    name: business?.name ?? "Kirei",
    localPart: settings.from_local_part || "outreach",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const enr of due as any[]) {
    const p = enr.prospects;
    const email = p?.email ? String(p.email).toLowerCase() : null;

    if (!email || suppressed.has(email)) {
      await sb.from("outreach_enrollments").update({
        status: "unsubscribed", next_send_at: null, stop_reason: !email ? "no email" : "suppressed",
      }).eq("id", enr.id);
      out.skipped++;
      continue;
    }

    const nextOrder = (enr.current_step ?? 0) + 1;
    const { data: step } = await sb.from("outreach_sequence_steps").select("*")
      .eq("sequence_id", enr.sequence_id).eq("step_order", nextOrder).maybeSingle();

    // No further step → the sequence is finished.
    if (!step) {
      await sb.from("outreach_enrollments").update({
        status: "completed", next_send_at: null, completed_at: new Date().toISOString(),
      }).eq("id", enr.id);
      out.completed++;
      continue;
    }

    // Unsubscribe token lives on the prospect (shared with one-off sends).
    let token: string | null = null;
    const { data: pRow } = await sb.from("prospects").select("unsub_token").eq("id", p.id).maybeSingle();
    token = pRow?.unsub_token ?? null;
    if (!token) {
      token = "u_" + randomBytes(16).toString("hex");
      await sb.from("prospects").update({ unsub_token: token }).eq("id", p.id);
    }

    const subject = mergeFields(step.subject, p);
    const bodyHtml = mergeFields(esc(step.body), p).replace(/\n/g, "<br>");
    const unsubUrl = `${appUrl()}/unsubscribe/${token}`;
    const html =
      `<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.5">` +
      bodyHtml +
      (settings.signature_html ? `<div style="margin-top:20px">${settings.signature_html}</div>` : "") +
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">` +
      `<p style="font-size:11px;color:#94a3b8">You received this from ${esc(business?.name ?? "us")}. ` +
      `<a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>.</p></div>`;

    // Record the message first so a webhook that beats us still has a row.
    const { data: msg } = await sb.from("outreach_messages").insert({
      business_id: businessId, enrollment_id: enr.id, campaign_id: enr.campaign_id,
      prospect_id: p.id, step_id: step.id, step_order: step.step_order,
      recipient: p.email, subject, body_preview: step.body.slice(0, 200),
    }).select("id").single();

    try {
      const res = await sendEmail({
        to: p.email, subject, html, from,
        replyTo: settings.reply_to || business?.email || undefined,
        tags: { business_id: businessId, doc_type: "outreach", doc_id: msg?.id },
      });
      const resendId = res?.id ?? null;
      if (resendId && msg?.id) {
        await sb.from("outreach_messages").update({ resend_id: resendId }).eq("id", msg.id);
      }

      // Advance the enrollment to the next step's due date.
      const { data: following } = await sb.from("outreach_sequence_steps")
        .select("delay_days").eq("sequence_id", enr.sequence_id)
        .eq("step_order", nextOrder + 1).maybeSingle();

      const patch: Record<string, unknown> = { current_step: nextOrder };
      if (following) {
        patch.next_send_at = new Date(Date.now() + (following.delay_days ?? 0) * 86400000).toISOString();
      } else {
        patch.status = "completed"; patch.next_send_at = null; patch.completed_at = new Date().toISOString();
        out.completed++;
      }
      await sb.from("outreach_enrollments").update(patch).eq("id", enr.id);

      // Mirror into the prospect record + activity log.
      await sb.from("prospect_activities").insert({
        business_id: businessId, prospect_id: p.id, type: "email", summary: subject,
      });
      const pPatch: Record<string, unknown> = { last_contacted_at: new Date().toISOString() };
      if (p.status === "new") pPatch.status = "contacted";
      await sb.from("prospects").update(pPatch).eq("id", p.id);

      out.sent++;
      out.detail.push({ prospect: p.email, step: nextOrder, status: "sent" });
    } catch (e) {
      if (msg?.id) {
        await sb.from("outreach_messages").update({
          status: "failed", error: e instanceof Error ? e.message : "send failed",
        }).eq("id", msg.id);
      }
      out.failed++;
      out.detail.push({ prospect: p.email, step: nextOrder, status: "failed" });
    }

    if (settings.seconds_between_sends > 0) await sleep(settings.seconds_between_sends * 1000);
  }

  return out;
}

/**
 * Enrol prospects matching a campaign's filter that aren't already in it.
 * Returns how many were added.
 */
export async function autoEnroll(sb: SB, businessId: string, campaignId: string): Promise<number> {
  const { data: c } = await sb.from("outreach_campaigns").select("*").eq("id", campaignId)
    .eq("business_id", businessId).maybeSingle();
  if (!c?.sequence_id || !c.auto_enroll) return 0;

  let q = sb.from("prospects").select("id").eq("business_id", businessId).not("email", "is", null);
  const f = c.filter ?? {};
  if (f.status?.length) q = q.in("status", f.status);
  if (f.sources?.length) q = q.in("source", f.sources);
  if (f.tags?.length) q = q.overlaps("tags", f.tags);
  const { data: candidates } = await q.limit(5000);
  if (!candidates?.length) return 0;

  const { data: existing } = await sb.from("outreach_enrollments")
    .select("prospect_id").eq("campaign_id", campaignId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const already = new Set(((existing ?? []) as any[]).map((e) => e.prospect_id));

  // First step's delay decides when the initial email is due.
  const { data: first } = await sb.from("outreach_sequence_steps").select("delay_days")
    .eq("sequence_id", c.sequence_id).eq("step_order", 1).maybeSingle();
  const dueAt = new Date(Date.now() + (first?.delay_days ?? 0) * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (candidates as any[])
    .filter((p) => !already.has(p.id))
    .map((p) => ({
      business_id: businessId, campaign_id: campaignId, prospect_id: p.id,
      sequence_id: c.sequence_id, current_step: 0, next_send_at: dueAt, status: "active",
    }));
  if (!rows.length) return 0;

  const { error } = await sb.from("outreach_enrollments").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** Stop every active enrollment for a prospect (bounce, reply, unsubscribe). */
export async function stopEnrollments(
  sb: SB, businessId: string, prospectId: string,
  status: "bounced" | "replied" | "unsubscribed" | "stopped", reason?: string,
): Promise<void> {
  await sb.from("outreach_enrollments").update({
    status, next_send_at: null, stop_reason: reason ?? status,
  }).eq("business_id", businessId).eq("prospect_id", prospectId).eq("status", "active");
}
