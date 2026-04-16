/**
 * Webhook dispatcher — fires outgoing webhooks for business events.
 *
 * Call `dispatchWebhook(businessId, event, data)` from any server action.
 * It's fire-and-forget — never throws, never blocks the caller.
 *
 * Zapier compatibility:
 *   - POST with JSON body
 *   - X-Webhook-Event header
 *   - X-Webhook-Signature header (HMAC-SHA256 if secret configured)
 *   - Delivery logged for debugging
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { WebhookEvent, BusinessWebhook } from "@/types/database";

interface WebhookPayload {
  event: WebhookEvent;
  business_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deliverWebhook(
  webhook: BusinessWebhook,
  payload: WebhookPayload
): Promise<void> {
  const sb = createAdminClient();
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": payload.event,
    "User-Agent": "Invoicer-Webhook/1.0",
  };

  if (webhook.secret) {
    headers["X-Webhook-Signature"] = `sha256=${await hmacSign(body, webhook.secret)}`;
  }

  let statusCode: number | null = null;
  let success = false;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    statusCode = res.status;
    success = res.ok;
    responseBody = await res.text().catch(() => null);
    if (responseBody && responseBody.length > 1000) {
      responseBody = responseBody.slice(0, 1000);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Log delivery
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any)
    .from("webhook_deliveries")
    .insert({
      webhook_id: webhook.id,
      event: payload.event,
      status_code: statusCode,
      success,
      payload,
      response_body: responseBody,
      error,
    })
    .then(() => {});
}

/**
 * Fire webhooks for a business event. Non-blocking, never throws.
 * Call this from any server action after a mutation.
 *
 * Usage:
 *   dispatchWebhook(businessId, "lead.created", { id, name, email, ... });
 */
export function dispatchWebhook(
  businessId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): void {
  // Run entirely in background — don't await, don't block the caller
  (async () => {
    try {
      const sb = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: webhooks } = await (sb as any)
        .from("business_webhooks")
        .select("*")
        .eq("business_id", businessId)
        .eq("enabled", true);

      if (!webhooks?.length) return;

      const payload: WebhookPayload = {
        event,
        business_id: businessId,
        timestamp: new Date().toISOString(),
        data,
      };

      // Filter to webhooks subscribed to this event
      const matching = (webhooks as BusinessWebhook[]).filter(
        (w) => w.events.includes(event)
      );

      // Deliver in parallel
      await Promise.allSettled(
        matching.map((w) => deliverWebhook(w, payload))
      );
    } catch (e) {
      console.error("[webhook] dispatch error:", e);
    }
  })();
}
