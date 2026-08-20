/**
 * Revolut Merchant API client (Hosted Checkout). Server-side only — the Merchant
 * Secret key must never reach the browser.
 *
 * Flow: create an order -> get a `checkout_url` -> redirect the customer ->
 * receive an ORDER_COMPLETED webhook. We ALSO re-fetch the order on webhook to
 * confirm its state authoritatively (belt-and-suspenders over signature checks).
 */

import crypto from "crypto";

export type RevolutMode = "sandbox" | "live";

// Newer Merchant API (versioned). Bump when Revolut requires a newer version.
const API_VERSION = "2024-09-01";

export function revolutBase(mode: RevolutMode): string {
  return mode === "live" ? "https://merchant.revolut.com" : "https://sandbox-merchant.revolut.com";
}

/** Amount to Revolut minor units (integer). Zero-decimal currencies are rare
 *  for our users (AUD/GBP/EUR/USD all use 2), so a *100 round is correct here. */
export function toRevolutAmount(amount: number): number {
  return Math.round(amount * 100);
}
export function fromRevolutAmount(minor: number): number {
  return Math.round(minor) / 100;
}

interface CreateOrderInput {
  secret: string;
  mode: RevolutMode;
  amountMinor: number;
  currency: string;
  description?: string;
  customerEmail?: string | null;
  /** Our invoice id — echoed back on the order + webhook for reconciliation. */
  reference: string;
  /** Where Revolut sends the customer after paying. */
  redirectUrl: string;
}

export interface RevolutOrder {
  id: string;
  state: string;
  checkout_url?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

async function revolutFetch(secret: string, mode: RevolutMode, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${revolutBase(mode)}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Revolut-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function createRevolutOrder(input: CreateOrderInput): Promise<RevolutOrder> {
  const body = {
    amount: input.amountMinor,
    currency: input.currency.toUpperCase(),
    description: input.description,
    ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
    merchant_order_data: { reference: input.reference },
    redirect_url: input.redirectUrl,
  };
  const res = await revolutFetch(input.secret, input.mode, "/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Revolut order failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as RevolutOrder;
}

/** Authoritative state check — call on webhook before marking an invoice paid. */
export async function retrieveRevolutOrder(secret: string, mode: RevolutMode, orderId: string): Promise<RevolutOrder> {
  const res = await revolutFetch(secret, mode, `/api/orders/${orderId}`, { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Revolut order fetch failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as RevolutOrder;
}

/** Cheap auth check used by "Test connection" — lists webhooks (needs a valid key). */
export async function revolutKeyWorks(secret: string, mode: RevolutMode): Promise<boolean> {
  try {
    const res = await revolutFetch(secret, mode, "/api/1.0/webhooks", { method: "GET" });
    // 200 = ok; 401/403 = bad key. Some plans 404 the list endpoint but still auth —
    // treat only auth failures as "not working".
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

/**
 * Verify a Revolut webhook signature. Revolut signs
 *   `v1.{Revolut-Request-Timestamp}.{rawBody}`
 * with the webhook signing secret (HMAC-SHA256, hex), and sends it in
 * `Revolut-Signature: v1=<hex>` (may carry multiple space/comma-separated sigs).
 */
export function verifyRevolutSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestamp: string | null;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, timestamp, secret } = opts;
  if (!signatureHeader || !timestamp || !secret) return false;
  const payload = `v1.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const provided = signatureHeader
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^v1=/, ""))
    .filter(Boolean);
  return provided.some((sig) => {
    try {
      return sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  });
}

interface RevolutWebhook {
  id: string;
  url: string;
  events?: string[];
  signing_secret?: string;
}

/**
 * Ensure a Revolut webhook exists for `webhookUrl` and return its signing
 * secret — so the app can wire the webhook itself instead of the user hunting
 * for Revolut's dashboard. Reuses an existing webhook for the same URL (Revolut
 * only allows 10), otherwise creates one for ORDER_COMPLETED/ORDER_AUTHORISED.
 */
export async function ensureRevolutWebhook(
  secret: string, mode: RevolutMode, webhookUrl: string,
): Promise<{ id: string; signingSecret: string | null }> {
  const events = ["ORDER_COMPLETED", "ORDER_AUTHORISED"];

  // Look for an existing webhook on this URL first.
  const listRes = await revolutFetch(secret, mode, "/api/1.0/webhooks", { method: "GET" });
  if (listRes.ok) {
    const list = (await listRes.json()) as RevolutWebhook[];
    const existing = Array.isArray(list) ? list.find((w) => w.url === webhookUrl) : undefined;
    if (existing) {
      // The list may omit the signing secret; fetch the single webhook for it.
      const oneRes = await revolutFetch(secret, mode, `/api/1.0/webhooks/${existing.id}`, { method: "GET" });
      const one = oneRes.ok ? ((await oneRes.json()) as RevolutWebhook) : existing;
      return { id: existing.id, signingSecret: one.signing_secret ?? existing.signing_secret ?? null };
    }
  }

  const res = await revolutFetch(secret, mode, "/api/1.0/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: webhookUrl, events }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Revolut webhook create failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const created = (await res.json()) as RevolutWebhook;
  return { id: created.id, signingSecret: created.signing_secret ?? null };
}

/** True when an order's state means the money is in. */
export function revolutOrderIsPaid(state: string | undefined): boolean {
  const s = (state ?? "").toLowerCase();
  return s === "completed" || s === "paid" || s === "authorised" || s === "authorized";
}

// ── Saved cards (card-on-file) ──────────────────────────────────────────────
//
// ⚠️ FIELD NAMES NEED CONFIRMING AGAINST REVOLUT'S REFERENCE BEFORE LIVE USE.
// developer.revolut.com returns 403 to unauthenticated fetches, so the field
// names below come from Revolut's public guides rather than the API reference
// I could read directly. The CAPABILITY is documented — save a payment method
// for the merchant, then charge it off-session (MIT) — but an exact key could
// differ. Everything uncertain is confined to the three functions below and
// each one surfaces Revolut's own error text verbatim, so a wrong field name
// shows up as a clear API message on the first sandbox run rather than a
// silent failure. Run it in sandbox before switching a business to live.

/** Create a hosted-checkout order that ALSO stores the card for later use. */
export async function createRevolutSaveCardOrder(input: {
  secret: string;
  mode: RevolutMode;
  /** Revolut requires an amount; a small verification charge is the usual
   *  pattern. Pass the real first payment when there is one. */
  amountMinor: number;
  currency: string;
  customerEmail?: string | null;
  customerName?: string | null;
  reference: string;
  redirectUrl: string;
  description?: string;
}): Promise<RevolutOrder> {
  const body = {
    amount: input.amountMinor,
    currency: input.currency.toUpperCase(),
    description: input.description ?? "Save card for future payments",
    ...(input.customerEmail
      ? { customer: { email: input.customerEmail, ...(input.customerName ? { full_name: input.customerName } : {}) } }
      : {}),
    // "merchant" = we can charge later without the customer present, which is
    // the whole point. "customer" would only speed up their next checkout.
    save_payment_method_for: "merchant",
    merchant_order_data: { reference: input.reference },
    redirect_url: input.redirectUrl,
  };
  const res = await revolutFetch(input.secret, input.mode, "/api/orders", {
    method: "POST", body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Revolut save-card order failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as RevolutOrder;
}

/** Every payment method Revolut holds for a customer. */
export async function listRevolutPaymentMethods(
  secret: string, mode: RevolutMode, customerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const res = await revolutFetch(secret, mode, `/api/customers/${customerId}/payment-methods`);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Revolut payment-method lookup failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.payment_methods ?? []);
}

export interface RevolutChargeResult { orderId: string; state: string }

/**
 * Charge a stored card with the customer absent (merchant-initiated).
 *
 * Two steps, mirroring how their hosted flow works: create the order, then
 * confirm it against the saved payment method. Any failure throws with
 * Revolut's own message so a decline, an expired card and a wrong field name
 * are all distinguishable rather than a generic "charge failed".
 */
export async function chargeRevolutSavedCard(input: {
  secret: string;
  mode: RevolutMode;
  amountMinor: number;
  currency: string;
  paymentMethodId: string;
  reference: string;
  description?: string;
}): Promise<RevolutChargeResult> {
  const created = await revolutFetch(input.secret, input.mode, "/api/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency.toUpperCase(),
      description: input.description,
      merchant_order_data: { reference: input.reference },
    }),
  });
  if (!created.ok) {
    const txt = await created.text().catch(() => "");
    throw new Error(`Revolut order failed (${created.status}): ${txt.slice(0, 300)}`);
  }
  const order = (await created.json()) as RevolutOrder;

  const confirmed = await revolutFetch(input.secret, input.mode, `/api/orders/${order.id}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      saved_payment_method: { id: input.paymentMethodId, initiator: "merchant" },
    }),
  });
  if (!confirmed.ok) {
    const txt = await confirmed.text().catch(() => "");
    throw new Error(`Revolut charge declined or failed (${confirmed.status}): ${txt.slice(0, 300)}`);
  }
  const result = (await confirmed.json()) as RevolutOrder;
  return { orderId: order.id, state: result.state ?? "unknown" };
}
