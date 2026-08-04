/**
 * MCP tools for the Telephony (VoIPcloud) plugin.
 * Scopes: telephony:read / telephony:write.
 *
 * The call log is the raw material for questions like "who called today that we
 * never rang back" — so the read tools are shaped around answering those rather
 * than dumping rows.
 */
import { z } from "zod";
import { assertScope, t, text, errorText } from "../context";
import { ctxFrom, UUID, appBase, type ToolFn } from "./shared";
import { matchNumber } from "@/lib/telephony/ingest";
import { matchKey, formatAuPhone } from "@/lib/telephony/phone";

const STATUS = z.enum(["ringing", "answered", "completed", "missed", "voicemail", "failed"]);

export function registerTelephonyTools(tool: ToolFn): void {
  tool("get_telephony_settings",
    "Phone-system integration status: whether it's on, the webhook URL to paste into VoIPcloud, and which automations run on a missed call or voicemail. Never returns the stored secret or API key.",
    {},
    async (_args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:read");
      const { data } = await t(ctx, "telephony_settings").select("*")
        .eq("business_id", ctx.businessId).maybeSingle();
      if (!data) return text({ enabled: false, configured: false });
      const { webhook_secret, api_key_enc, webhook_token, ...safe } = data;
      return text({
        ...safe,
        webhook_url: `${appBase()}/api/webhooks/voipcloud/${webhook_token}`,
        webhook_secret_set: Boolean(webhook_secret),
        api_key_set: Boolean(api_key_enc),
      });
    });

  tool("update_telephony_settings",
    "Turn the phone-system integration on/off and choose what happens automatically when a call is missed or a voicemail is left.",
    {
      enabled: z.boolean().optional(),
      log_calls: z.boolean().optional(),
      create_lead_on_missed: z.boolean().optional(),
      create_task_on_missed: z.boolean().optional(),
      create_task_on_voicemail: z.boolean().optional(),
      webhook_secret: z.string().optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:write");
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) return errorText("Nothing to update");
      const { error } = await t(ctx, "telephony_settings")
        .upsert({ business_id: ctx.businessId, ...patch }, { onConflict: "business_id" });
      if (error) throw error;
      return text({ updated: true, ...patch, webhook_secret: patch.webhook_secret ? "(set)" : undefined });
    });

  tool("list_calls",
    "The call log: who called, when, how long, whether it was answered, and which customer/lead it matched. Filter by status (missed/voicemail/...), direction, customer, or unmatched-only.",
    {
      status: STATUS.optional(),
      direction: z.enum(["inbound", "outbound"]).optional(),
      customer_id: UUID.optional(),
      unmatched_only: z.boolean().optional(),
      since: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:read");
      let q = t(ctx, "calls")
        .select("id, direction, status, from_number, to_number, caller_name, user_name, started_at, duration_seconds, customer_id, lead_id, contact_id, prospect_id, created_task_id, notes, customers(name), leads(name)")
        .eq("business_id", ctx.businessId)
        .order("started_at", { ascending: false }).limit(args.limit ?? 100);
      if (args.status) q = q.eq("status", args.status);
      if (args.direction) q = q.eq("direction", args.direction);
      if (args.customer_id) q = q.eq("customer_id", args.customer_id);
      if (args.since) q = q.gte("started_at", args.since);
      if (args.unmatched_only) {
        q = q.is("customer_id", null).is("lead_id", null).is("contact_id", null).is("prospect_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return text(data);
    });

  tool("get_call_stats",
    "Call volume summary: total, inbound vs outbound, missed, voicemail, and how many came from numbers you don't have on file.",
    { since: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:read");
      let q = t(ctx, "calls").select("direction, status, customer_id, lead_id, contact_id, prospect_id")
        .eq("business_id", ctx.businessId).limit(5000);
      if (args.since) q = q.gte("started_at", args.since);
      const { data } = await q;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      return text({
        total: rows.length,
        inbound: rows.filter((r) => r.direction === "inbound").length,
        outbound: rows.filter((r) => r.direction === "outbound").length,
        missed: rows.filter((r) => r.status === "missed").length,
        voicemail: rows.filter((r) => r.status === "voicemail").length,
        unmatched: rows.filter((r) => !r.customer_id && !r.lead_id && !r.contact_id && !r.prospect_id).length,
      });
    });

  tool("identify_caller",
    "Look up a phone number against customers, contacts, leads and prospects. Matches regardless of format (+61…, 0…, spaces, brackets).",
    { phone: z.string() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:read");
      const key = matchKey(args.phone);
      if (!key) return errorText("That doesn't look like a full phone number");
      const m = await matchNumber(ctx.sb, ctx.businessId, args.phone);
      const kind = m.customer_id ? "customer" : m.contact_id ? "contact"
        : m.lead_id ? "lead" : m.prospect_id ? "prospect" : null;
      return text({ phone: formatAuPhone(args.phone), match_key: key, matched: kind, ...m });
    });

  tool("set_call_notes", "Record what was discussed on a call.",
    { call_id: UUID, notes: z.string() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:write");
      const { error } = await t(ctx, "calls").update({ notes: args.notes })
        .eq("id", args.call_id).eq("business_id", ctx.businessId);
      if (error) throw error;
      return text({ updated: true });
    });

  tool("sync_calls",
    "Pull call history from the VoIPcloud REST API — use to backfill calls from before the webhook was connected, or to recover anything it missed. Deduped on the PBX call id, and follow-up automations stay off during a backfill.",
    { days: z.number().int().min(1).max(365).optional(), include_groups: z.boolean().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:write");
      const { syncCallsForBusiness, ymd } = await import("@/lib/telephony/sync");
      const res = await syncCallsForBusiness(ctx.sb, ctx.businessId, {
        fromDate: ymd(new Date(Date.now() - (args.days ?? 30) * 86400000)),
        includeGroups: args.include_groups ?? true,
      });
      if (res.errors.length && !res.ingested) return errorText(res.errors[0]);
      return text(res);
    });

  tool("place_call",
    "Click-to-call: rings the configured extension, then dials this number once it is picked up. Give a phone number, or a customer_id to use their number on file.",
    { phone: z.string().optional(), customer_id: UUID.optional(), from_extension: z.string().optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:write");

      let phone = args.phone ?? null;
      if (!phone && args.customer_id) {
        const { data } = await t(ctx, "customers").select("phone")
          .eq("id", args.customer_id).eq("business_id", ctx.businessId).maybeSingle();
        phone = data?.phone ?? null;
      }
      if (!phone) return errorText("Give a phone number, or a customer_id that has one on file");

      const { data: s } = await t(ctx, "telephony_settings")
        .select("api_key_enc, api_base_url, default_user_number, default_caller_id, enabled")
        .eq("business_id", ctx.businessId).maybeSingle();
      if (!s?.enabled) return errorText("Phone system isn't connected");
      if (!s.api_key_enc) return errorText("No API key saved — add one in Calls → Setup");

      const from = args.from_extension || s.default_user_number;
      if (!from) return errorText("No extension configured to call from");

      const { toE164 } = await import("@/lib/telephony/phone");
      const dest = toE164(phone);
      if (!dest) return errorText("That doesn't look like a callable number");

      const { callToNumber, VOIP_DEFAULT_BASE } = await import("@/lib/telephony/api");
      const { decryptSecret } = await import("@/lib/crypto");
      await callToNumber(s.api_base_url || VOIP_DEFAULT_BASE, decryptSecret(s.api_key_enc), {
        user_number: from, number_to_call: dest, caller_id: s.default_caller_id || undefined,
      });
      return text({ calling: dest, from_extension: from });
    });

  tool("rematch_calls",
    "Re-run caller-ID matching over unmatched calls — use after adding customers, so earlier calls from that number link up.",
    { limit: z.number().int().min(1).max(500).optional() },
    async (args, extra) => {
      const ctx = ctxFrom(extra); assertScope(ctx, "telephony:write");
      const { data } = await t(ctx, "calls").select("id, counterparty_digits")
        .eq("business_id", ctx.businessId)
        .is("customer_id", null).is("lead_id", null).is("contact_id", null).is("prospect_id", null)
        .not("counterparty_digits", "is", null).limit(args.limit ?? 200);

      let matched = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const call of ((data ?? []) as any[])) {
        const m = await matchNumber(ctx.sb, ctx.businessId, call.counterparty_digits);
        if (!m.customer_id && !m.lead_id && !m.contact_id && !m.prospect_id) continue;
        await t(ctx, "calls").update({
          customer_id: m.customer_id ?? null, contact_id: m.contact_id ?? null,
          lead_id: m.lead_id ?? null, prospect_id: m.prospect_id ?? null,
        }).eq("id", call.id);
        matched++;
      }
      return text({ rematched: matched, scanned: (data ?? []).length });
    });
}
