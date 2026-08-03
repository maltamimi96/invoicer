/**
 * VoIPcloud webhook ingest — turns a PBX call event into a Kirei call record,
 * matched to whoever was on the other end, plus the follow-up automations.
 *
 * One real-world call fires several events (ringing → answered → completion,
 * then possibly a recording event), and they can arrive out of order or be
 * retried. So every event UPSERTS the same row keyed on the PBX's
 * `unique_call_id`, and each stage only widens what we know — a late "ringing"
 * event can never downgrade a call that already completed.
 *
 * Server-only: runs as the admin client from an unauthenticated webhook, so
 * every write is explicitly scoped by business_id.
 */
import { matchKey } from "./phone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/** The subset of the payload we rely on. Everything is kept in `raw` too. */
export interface VoipEvent {
  type?: string;
  unique_call_id?: string;
  caller_id?: string;
  caller_name?: string;
  user_name?: string;
  user_number?: string;
  dest_number?: string;
  call_start_at?: string;
  duration?: number | string;
  recording_url?: string;
  [k: string]: unknown;
}

export type CallDirection = "inbound" | "outbound";
export type CallStatus = "ringing" | "answered" | "completed" | "missed" | "voicemail" | "failed";

/**
 * Classify an event from its `type`.
 *
 * VoIPcloud's docs name the 11 triggers in prose ("User inbound call
 * answered") but don't pin the exact wire strings, so this matches on
 * substrings rather than an equality table. An unrecognised type still logs
 * the call — it just doesn't advance the status.
 */
export function classify(type: string | undefined): { direction: CallDirection; stage: CallStatus | "recording" | null } {
  const t = String(type ?? "").toLowerCase();
  const direction: CallDirection = t.includes("outbound") ? "outbound" : "inbound";

  if (t.includes("voicemail")) return { direction, stage: "voicemail" };
  if (t.includes("recording")) return { direction, stage: "recording" };
  if (t.includes("answer")) return { direction, stage: "answered" };
  if (t.includes("completion") || t.includes("summary") || t.includes("complete")) {
    return { direction, stage: "completed" };
  }
  if (t.includes("call")) return { direction, stage: "ringing" };
  return { direction, stage: null };
}

/** Rank so a late-arriving earlier event can't undo a later one. */
const RANK: Record<CallStatus, number> = {
  ringing: 0, answered: 1, voicemail: 2, missed: 2, completed: 3, failed: 3,
};

/** The FK columns a match can set — exactly the shape written to `calls`. */
export interface MatchIds {
  customer_id?: string; contact_id?: string; lead_id?: string; prospect_id?: string;
}

/** A match plus a human label for display. `label` is NOT a column on calls. */
export interface MatchResult extends MatchIds {
  label?: string;
}

/** Drop the display-only fields so the rest can be spread into a row. */
export function matchIds(m: MatchResult): MatchIds {
  const { customer_id, contact_id, lead_id, prospect_id } = m;
  return { customer_id, contact_id, lead_id, prospect_id };
}

/**
 * Resolve a number to a known party. Priority is deliberate: a customer beats
 * a lead beats a prospect, because the most-qualified relationship is the one
 * the user wants to see when the phone rings.
 */
export async function matchNumber(sb: SB, businessId: string, number: string | null | undefined): Promise<MatchResult> {
  const key = matchKey(number);
  if (!key) return {};

  const lookups: [string, keyof MatchResult, string][] = [
    ["customers", "customer_id", "name"],
    ["contacts", "contact_id", "name"],
    ["leads", "lead_id", "name"],
    ["prospects", "prospect_id", "company"],
  ];

  for (const [table, field, labelCol] of lookups) {
    const { data } = await sb.from(table)
      .select(`id, ${labelCol}`)
      .eq("business_id", businessId).eq("phone_digits", key)
      .limit(1).maybeSingle();
    if (data?.id) return { [field]: data.id, label: data[labelCol] ?? undefined } as MatchResult;
  }
  return {};
}

export interface IngestResult {
  call_id: string | null;
  status: CallStatus | null;
  matched: string | null;
  created_lead: boolean;
  created_task: boolean;
}

/** Handle one webhook event end to end. */
export async function ingestCallEvent(
  sb: SB, businessId: string, event: VoipEvent,
): Promise<IngestResult> {
  const out: IngestResult = { call_id: null, status: null, matched: null, created_lead: false, created_task: false };

  const { data: settings } = await sb.from("telephony_settings").select("*")
    .eq("business_id", businessId).maybeSingle();
  if (!settings?.enabled || !settings.log_calls) return out;

  const { direction, stage } = classify(event.type);
  const externalId = event.unique_call_id ? String(event.unique_call_id) : null;

  // On an inbound call the outside party is the caller; on an outbound one
  // it's the number we dialled.
  const counterparty = direction === "inbound"
    ? (event.caller_id ?? null)
    : (event.dest_number ?? event.caller_id ?? null);

  const existing = externalId
    ? (await sb.from("calls").select("*").eq("business_id", businessId).eq("external_id", externalId).maybeSingle()).data
    : null;

  // Never regress: a retried "ringing" must not overwrite "completed".
  const priorRank = existing ? RANK[existing.status as CallStatus] ?? -1 : -1;
  let status: CallStatus = (existing?.status as CallStatus) ?? "ringing";
  if (stage && stage !== "recording" && (RANK[stage] ?? -1) >= priorRank) status = stage;

  // A completed inbound call that was never answered is a MISSED call — the
  // single most valuable signal here, since a missed call is a lost job.
  const durationRaw = event.duration;
  const duration = durationRaw === undefined || durationRaw === null || durationRaw === ""
    ? null : Number(durationRaw);
  const everAnswered = Boolean(existing?.answered_at) || stage === "answered";
  if (status === "completed" && direction === "inbound" && !everAnswered) status = "missed";

  const match = existing?.customer_id || existing?.lead_id || existing?.contact_id || existing?.prospect_id
    ? {
        customer_id: existing.customer_id ?? undefined, contact_id: existing.contact_id ?? undefined,
        lead_id: existing.lead_id ?? undefined, prospect_id: existing.prospect_id ?? undefined,
      }
    : matchIds(await matchNumber(sb, businessId, counterparty));

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    business_id: businessId,
    provider: "voipcloud",
    external_id: externalId,
    direction,
    status,
    from_number: direction === "inbound" ? (event.caller_id ?? null) : (event.user_number ?? null),
    to_number: direction === "inbound" ? (event.user_number ?? null) : (event.dest_number ?? null),
    counterparty_digits: matchKey(counterparty) || null,
    caller_name: event.caller_name ?? null,
    user_name: event.user_name ?? null,
    user_number: event.user_number ?? null,
    started_at: existing?.started_at ?? (event.call_start_at ? new Date(event.call_start_at).toISOString() : now),
    updated_at: now,
    raw: { ...(existing?.raw ?? {}), [String(event.type ?? "event")]: event },
    ...match,
  };
  if (stage === "answered") row.answered_at = existing?.answered_at ?? now;
  if (status === "completed" || status === "missed") row.ended_at = existing?.ended_at ?? now;
  if (duration !== null && Number.isFinite(duration)) row.duration_seconds = Math.round(duration);
  if (stage === "recording" && event.recording_url) row.recording_url = String(event.recording_url);

  let callId = existing?.id ?? null;
  if (existing) {
    await sb.from("calls").update(row).eq("id", existing.id);
  } else {
    const { data: created, error } = await sb.from("calls").insert(row).select("id").single();
    if (error) {
      // A concurrent event for the same call raced us to the unique index —
      // re-read and update instead of dropping the event.
      const { data: again } = await sb.from("calls").select("id")
        .eq("business_id", businessId).eq("external_id", externalId).maybeSingle();
      if (!again?.id) throw error;
      callId = again.id;
      await sb.from("calls").update(row).eq("id", again.id);
    } else {
      callId = created.id;
    }
  }

  out.call_id = callId;
  out.status = status;
  out.matched = match.customer_id ? "customer" : match.contact_id ? "contact"
    : match.lead_id ? "lead" : match.prospect_id ? "prospect" : null;

  // ── Automations, only at the moment the call actually ends ────────────────
  const terminal = status === "missed" || status === "voicemail";
  if (!terminal || !callId) return out;

  const fresh = (await sb.from("calls").select("created_lead_id, created_task_id").eq("id", callId).maybeSingle()).data;
  const patch: Record<string, unknown> = {};

  // Unknown number that rang out → a lead, so it can be worked rather than lost.
  // upsert_lead is the single ingest entry point everywhere else (it owns the
  // identity_key dedupe), so a repeat caller merges instead of duplicating.
  if (settings.create_lead_on_missed && !out.matched && !fresh?.created_lead_id && counterparty) {
    try {
      const { data: lead } = await sb.rpc("upsert_lead", {
        p_business_id: businessId,
        p_user_id: null,
        p_name: event.caller_name || `Missed call ${counterparty}`,
        p_email: null,
        p_phone: counterparty,
        p_address: null,
        p_suburb: null,
        p_service: null,
        p_property_type: null,
        p_timing: null,
        p_notes: `Missed ${direction} call${event.user_name ? ` to ${event.user_name}` : ""}.`,
        p_source: "phone",
        p_source_ref: externalId,
      }).single();
      const leadId = typeof lead === "string" ? lead : lead?.id;
      if (leadId) { patch.created_lead_id = leadId; out.created_lead = true; }
    } catch {
      // A lead we couldn't create must not cost us the call log itself.
    }
  }

  // Either way, someone should call them back.
  const wantTask = status === "voicemail" ? settings.create_task_on_voicemail : settings.create_task_on_missed;
  if (wantTask && !fresh?.created_task_id) {
    const who = out.matched ?? "unknown number";
    const { data: task } = await sb.from("tasks").insert({
      business_id: businessId,
      title: status === "voicemail"
        ? `Voicemail from ${event.caller_name || counterparty || "unknown"}`
        : `Call back ${event.caller_name || counterparty || "unknown"}`,
      description: `${status === "voicemail" ? "Voicemail left" : "Missed call"} at `
        + `${new Date(String(row.started_at)).toLocaleString("en-AU")} (${who}).`,
      status: "todo",
      related_customer_id: match.customer_id ?? null,
      related_contact_id: match.contact_id ?? null,
    }).select("id").single();
    if (task?.id) { patch.created_task_id = task.id; out.created_task = true; }
  }

  if (Object.keys(patch).length) await sb.from("calls").update(patch).eq("id", callId);
  return out;
}
