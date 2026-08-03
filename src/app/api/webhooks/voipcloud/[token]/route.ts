/**
 * POST /api/webhooks/voipcloud/[token]
 *
 * Receives call events from a business's VoIPcloud PBX.
 *
 * The request carries no session, so the business is identified by the
 * unguessable token in the path — the same approach the customer portal uses.
 * The token alone is not treated as proof: when the business has configured a
 * Secret Token in VoIPcloud, the X-Pbx-Token header must match it.
 *
 * Always answers 200 once the event is accepted. A PBX that gets an error
 * retries, and a retry storm over a bug in our automations would be worse than
 * a dropped event — the raw payload is stored either way.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCallEvent, type VoipEvent } from "@/lib/telephony/ingest";

export const maxDuration = 30;

/** Constant-time compare so the secret can't be recovered by timing. */
function secretMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (sb as any)
    .from("telephony_settings")
    .select("business_id, enabled, webhook_secret")
    .eq("webhook_token", token)
    .maybeSingle();

  // Same response for an unknown token and a disabled plugin, so the endpoint
  // can't be used to enumerate which tokens are live.
  if (!settings?.business_id || !settings.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (settings.webhook_secret) {
    const given = req.headers.get("x-pbx-token") ?? "";
    if (!given || !secretMatches(settings.webhook_secret, given)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Some PBX configurations batch events into an array.
  const events: VoipEvent[] = Array.isArray(payload) ? payload : [payload as VoipEvent];

  const results = [];
  for (const event of events) {
    try {
      results.push(await ingestCallEvent(sb, settings.business_id, event));
    } catch (e) {
      // Log and keep going: one malformed event shouldn't cost us the batch,
      // and a 500 would make the PBX retry the whole thing.
      console.error("voipcloud ingest failed", e);
      results.push({ error: true });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
