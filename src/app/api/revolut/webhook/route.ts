import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { retrieveRevolutOrder, revolutOrderIsPaid, verifyRevolutSignature, type RevolutMode } from "@/lib/revolut";
import { recordRevolutPayment } from "@/lib/revolut-payments";

// Revolut webhook. Payload carries an order id; we map it back to the business,
// verify the signature against THAT business's webhook secret, then re-fetch the
// order from Revolut to authoritatively confirm it's paid before recording.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  let payload: { event?: string; order_id?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const orderId = payload.order_id;
  if (!orderId) return NextResponse.json({ ok: true }); // nothing to reconcile

  try {
    const sb = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (n: string) => (sb as any).from(n);

    const { data: map } = await t("revolut_orders")
      .select("business_id, invoice_id, amount, portal_token").eq("order_id", orderId).maybeSingle();
    if (!map) return NextResponse.json({ ok: true }); // unknown order — not ours

    const { data: biz } = await t("businesses")
      .select("revolut_secret_enc, revolut_webhook_secret_enc, revolut_mode").eq("id", map.business_id).maybeSingle();
    if (!biz?.revolut_secret_enc) return NextResponse.json({ ok: true });

    // Verify signature when a webhook secret is configured. If it's set and the
    // signature fails, reject — don't record on an unverified event.
    if (biz.revolut_webhook_secret_enc) {
      const ok = verifyRevolutSignature({
        rawBody: raw,
        signatureHeader: req.headers.get("revolut-signature"),
        timestamp: req.headers.get("revolut-request-timestamp"),
        secret: decryptSecret(biz.revolut_webhook_secret_enc),
      });
      if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }

    // Authoritative confirmation: re-fetch the order rather than trusting the event.
    const secret = decryptSecret(biz.revolut_secret_enc);
    const mode = (biz.revolut_mode as RevolutMode) ?? "sandbox";
    const order = await retrieveRevolutOrder(secret, mode, orderId);
    if (!revolutOrderIsPaid(order.state)) return NextResponse.json({ ok: true }); // not paid (yet)

    await recordRevolutPayment(sb, {
      businessId: map.business_id,
      invoiceId: map.invoice_id,
      orderId,
      amount: Number(map.amount),
      portalToken: map.portal_token ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[revolut/webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
