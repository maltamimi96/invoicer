/**
 * Pull call history from the VoIPcloud REST API.
 *
 * The webhook only ever tells us about calls made from now on. This fills the
 * two gaps that leaves: history from before the plugin was connected, and any
 * event the webhook dropped (a deploy, an outage, a wrong secret).
 *
 * Synced rows go through the SAME ingestCallEvent() the webhook uses, keyed on
 * unique_call_id — so a call that arrives both ways is one row, not two, and
 * neither path can produce a shape the other wouldn't.
 *
 * Automations are suppressed during a sync: back-filling six months of history
 * must not create six months of "call back" tasks.
 */
import { getUserCalls, getQueueCalls, getRingGroupCalls, userCallToEvent, groupCallToEvent, VOIP_DEFAULT_BASE } from "./api";
import { ingestCallEvent } from "./ingest";
import { decryptSecret } from "@/lib/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface SyncResult {
  fetched: number;
  ingested: number;
  skipped: number;
  errors: string[];
}

/** yyyy-mm-dd, the format their from_date/to_date expect. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface SyncOptions {
  /** Defaults to the last 30 days. */
  fromDate?: string;
  toDate?: string;
  /** Their max page is 10000; we page in 500s to keep responses small. */
  pageSize?: number;
  maxPages?: number;
  /** Include queue + ring-group history as well as per-user. */
  includeGroups?: boolean;
}

export async function syncCallsForBusiness(
  sb: SB, businessId: string, opts: SyncOptions = {},
): Promise<SyncResult> {
  const out: SyncResult = { fetched: 0, ingested: 0, skipped: 0, errors: [] };

  const { data: settings } = await sb.from("telephony_settings").select("*")
    .eq("business_id", businessId).maybeSingle();
  if (!settings?.enabled) { out.errors.push("Telephony is not enabled"); return out; }
  if (!settings.api_key_enc) { out.errors.push("No API key saved — add one in Calls → Setup"); return out; }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.api_key_enc);
  } catch {
    out.errors.push("Couldn't decrypt the API key — is APP_ENCRYPTION_KEY set on the server?");
    return out;
  }

  const base = settings.api_base_url || VOIP_DEFAULT_BASE;
  const to = opts.toDate ?? ymd(new Date());
  const from = opts.fromDate ?? ymd(new Date(Date.now() - 30 * 86400_000));
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? 500));
  const maxPages = Math.max(1, opts.maxPages ?? 20);

  // A historical backfill must not spray tasks across the board, so the
  // automations are turned off for the duration and restored afterwards.
  const automations = {
    create_lead_on_missed: settings.create_lead_on_missed,
    create_task_on_missed: settings.create_task_on_missed,
    create_task_on_voicemail: settings.create_task_on_voicemail,
  };
  const anyAutomation = Object.values(automations).some(Boolean);
  if (anyAutomation) {
    await sb.from("telephony_settings").update({
      create_lead_on_missed: false, create_task_on_missed: false, create_task_on_voicemail: false,
    }).eq("business_id", businessId);
  }

  try {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      // Their offset caps at 9999.
      if (offset > 9999) break;

      let rows;
      try {
        rows = await getUserCalls(base, apiKey, { from_date: from, to_date: to, offset, limit: pageSize });
      } catch (e) {
        out.errors.push(e instanceof Error ? e.message : "Fetch failed");
        break;
      }
      if (!rows.length) break;
      out.fetched += rows.length;

      for (const row of rows) {
        if (!row.unique_call_id) { out.skipped++; continue; }
        try {
          const res = await ingestCallEvent(sb, businessId, userCallToEvent(row));
          if (res.call_id) out.ingested++; else out.skipped++;
        } catch (e) {
          out.errors.push(e instanceof Error ? e.message : "Ingest failed");
        }
      }
      if (rows.length < pageSize) break;
    }

    if (opts.includeGroups) {
      for (const [fetcher, kind] of [
        [getQueueCalls, "queue"], [getRingGroupCalls, "ringgroup"],
      ] as const) {
        try {
          const rows = await fetcher(base, apiKey, { from_date: from, to_date: to, limit: pageSize });
          out.fetched += rows.length;
          for (const row of rows) {
            if (!row.unique_call_id) { out.skipped++; continue; }
            const res = await ingestCallEvent(sb, businessId, groupCallToEvent(row, kind));
            if (res.call_id) out.ingested++; else out.skipped++;
          }
        } catch (e) {
          out.errors.push(e instanceof Error ? e.message : `${kind} fetch failed`);
        }
      }
    }
  } finally {
    if (anyAutomation) {
      await sb.from("telephony_settings").update(automations).eq("business_id", businessId);
    }
    await sb.from("telephony_settings").update({
      last_sync_at: new Date().toISOString(),
      ...(out.errors.length ? { last_error_at: new Date().toISOString(), last_error: out.errors[0] } : {}),
    }).eq("business_id", businessId);
  }

  return out;
}
