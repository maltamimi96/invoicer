import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerAllowsCard } from "@/lib/payment-methods";
import { decryptSecret } from "@/lib/crypto";
import { createRevolutOrder, toRevolutAmount, type RevolutMode } from "@/lib/revolut";

// Public, token-gated. Creates a Revolut order for an invoice's balance and
// redirects the customer to Revolut's hosted checkout. Mirrors the Stripe
// checkout route.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoice");
  const token = url.searchParams.get("token");
  if (!invoiceId || !token) {
    return NextResponse.json({ error: "Missing invoice or token" }, { status: 400 });
  }

  try {
    const sb = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (n: string) => (sb as any).from(n);

    const { data: link } = await t("customer_portal_tokens")
      .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: "Token expired" }, { status: 404 });
    }

    const [{ data: invoice }, { data: business }, { data: customer }] = await Promise.all([
      t("invoices").select("id, number, total, amount_paid, status, customer_id, business_id")
        .eq("id", invoiceId).eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle(),
      t("businesses").select("revolut_enabled, revolut_secret_enc, revolut_mode, currency")
        .eq("id", link.business_id).maybeSingle(),
      t("customers").select("email, allowed_payment_methods").eq("id", link.customer_id).maybeSingle(),
    ]);

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!business?.revolut_enabled || !business.revolut_secret_enc) {
      return NextResponse.json({ error: "Revolut is not enabled for this business" }, { status: 400 });
    }
    if (!customerAllowsCard(customer?.allowed_payment_methods)) {
      return NextResponse.json({ error: "Card payment is not available for this customer" }, { status: 403 });
    }

    const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid ?? 0));
    if (balance < 0.5) return NextResponse.json({ error: "Nothing to pay" }, { status: 400 });

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${url.protocol}//${url.host}`;
    const currency = (business.currency as string) || "AUD";
    const secret = decryptSecret(business.revolut_secret_enc);
    const mode = (business.revolut_mode as RevolutMode) ?? "sandbox";

    const order = await createRevolutOrder({
      secret, mode,
      amountMinor: toRevolutAmount(balance),
      currency,
      description: `Invoice ${invoice.number}`,
      customerEmail: customer?.email ?? null,
      reference: invoice.id,
      redirectUrl: `${base}/portal/${token}/invoice/${invoice.id}?paid=1`,
    });

    if (!order.checkout_url) {
      return NextResponse.json({ error: "Revolut did not return a checkout URL" }, { status: 502 });
    }

    // Map the order so the webhook can reconcile it back to this invoice/business.
    await t("revolut_orders").upsert({
      order_id: order.id,
      business_id: link.business_id,
      invoice_id: invoice.id,
      amount: balance,
      currency,
      portal_token: token,
    });

    return NextResponse.redirect(order.checkout_url, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[revolut/checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
