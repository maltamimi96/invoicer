import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Dropbox Sign (HelloSign) event callback.
// The provider POSTs multipart form-data with a `json` field. We verify the
// event_hash (HMAC-SHA256 of `${event_time}${event_type}` keyed by the API key)
// then advance the matching contract's status. Must always 200 with the literal
// body "Hello API Event Received" or Dropbox Sign marks the hook as failing.
export const dynamic = "force-dynamic";

const OK = () => new NextResponse("Hello API Event Received", { status: 200 });

export async function POST(req: NextRequest) {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  if (!apiKey) return OK();

  let payload: unknown;
  try {
    const form = await req.formData();
    const raw = form.get("json");
    if (typeof raw !== "string") return OK();
    payload = JSON.parse(raw);
  } catch {
    return OK();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = (payload as any)?.event;
  if (!event) return OK();
  const eventTime = String(event.event_time ?? "");
  const eventType = String(event.event_type ?? "");
  const expected = createHmac("sha256", apiKey).update(eventTime + eventType).digest("hex");
  if (event.event_hash !== expected) return OK(); // bad signature — ack but ignore

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqId: string | undefined = (payload as any)?.signature_request?.signature_request_id;
  if (!reqId) return OK();

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contract } = await (admin as any).from("contracts")
    .select("id, business_id, status, audit").eq("provider_request_id", reqId).maybeSingle();
  if (!contract) return OK();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sr = (payload as any)?.signature_request ?? {};
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { audit: { ...(contract.audit ?? {}), [eventType]: nowIso } };

  if (eventType === "signature_request_viewed" && contract.status === "sent") {
    update.status = "viewed"; update.viewed_at = nowIso;
  } else if (eventType === "signature_request_all_signed" || sr.is_complete === true) {
    update.status = "signed"; update.signed_at = nowIso;
    // Pull the final signed PDF and store it in the private bucket.
    try {
      const resp = await fetch(`https://api.hellosign.com/v3/signature_request/files/${reqId}?file_type=pdf`, {
        headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64") },
      });
      if (resp.ok) {
        const bytes = Buffer.from(await resp.arrayBuffer());
        const path = `${contract.business_id}/signed/${reqId}.pdf`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).storage.from("contracts").upload(path, bytes, { contentType: "application/pdf", upsert: true });
        update.signed_path = path;
      }
    } catch { /* keep status update even if the file fetch fails */ }
  } else if (eventType === "signature_request_declined") {
    update.status = "declined";
  } else if (eventType === "signature_request_canceled") {
    update.status = "voided";
  }

  if (update.status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("contracts").update(update).eq("id", contract.id);
  }
  return OK();
}
