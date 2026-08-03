import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Webhook } from "svix";

// Resend signs webhook payloads via Svix. Verifying the signature is required —
// otherwise anyone could POST fake "delivered" events. Set RESEND_WEBHOOK_SECRET
// to the secret shown when you create the endpoint in Resend's dashboard.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();

  if (secret) {
    const id = req.headers.get("svix-id") ?? "";
    const ts = req.headers.get("svix-timestamp") ?? "";
    const sig = req.headers.get("svix-signature") ?? "";
    try {
      new Webhook(secret).verify(body, { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig });
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const evt = payload as {
    type?: string;
    data?: {
      email_id?: string;
      to?: string | string[];
      created_at?: string;
      bounce?: { message?: string };
    };
  };

  const type = evt.type ?? "";
  const resendId = evt.data?.email_id;
  if (!resendId) return NextResponse.json({ ok: true });

  // Map Resend event names to our internal status enum.
  const STATUS_MAP: Record<string, string> = {
    "email.sent":              "sent",
    "email.delivered":         "delivered",
    "email.delivery_delayed":  "delivery_delayed",
    "email.bounced":           "bounced",
    "email.complained":        "complained",
    "email.opened":            "opened",
    "email.clicked":           "clicked",
    "email.failed":            "failed",
  };
  const status = STATUS_MAP[type];
  if (!status) return NextResponse.json({ ok: true });

  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { status, raw: evt };
  const now = evt.data?.created_at ?? new Date().toISOString();
  if (status === "delivered") update.delivered_at = now;
  if (status === "opened")    update.opened_at    = now;
  if (status === "clicked")   update.clicked_at   = now;
  if (status === "bounced") {
    update.bounced_at = now;
    update.error = evt.data?.bounce?.message ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("email_events").update(update).eq("resend_id", resendId);

  // Outreach messages carry their own copy of the lifecycle so the campaign
  // dashboard can report open/click/bounce rates without joining email_events.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msg } = await (sb as any)
    .from("outreach_messages")
    .select("id, business_id, prospect_id")
    .eq("resend_id", resendId)
    .maybeSingle();

  if (msg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mUpdate: any = { status };
    if (status === "delivered") mUpdate.delivered_at = now;
    if (status === "opened")    mUpdate.opened_at    = now;
    if (status === "clicked")   mUpdate.clicked_at   = now;
    if (status === "bounced")   { mUpdate.bounced_at = now; mUpdate.error = evt.data?.bounce?.message ?? null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("outreach_messages").update(mUpdate).eq("id", msg.id);

    // A hard bounce or a spam complaint must stop the sequence immediately —
    // continuing to email that address is what wrecks sender reputation.
    if ((status === "bounced" || status === "complained") && msg.prospect_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("outreach_enrollments").update({
        status: status === "bounced" ? "bounced" : "unsubscribed",
        next_send_at: null,
        stop_reason: status,
      }).eq("business_id", msg.business_id).eq("prospect_id", msg.prospect_id).eq("status", "active");

      // Complaints also go on the suppression list so no future campaign can
      // re-enrol them. The table's uniqueness is a lower(email) expression
      // index, which PostgREST's on_conflict can't target — so this is a plain
      // insert whose duplicate error is deliberately ignored.
      if (status === "complained" && evt.data?.to?.[0]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("prospect_suppressions")
          .insert({ business_id: msg.business_id, email: String(evt.data.to[0]).toLowerCase(), reason: "complained" });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
