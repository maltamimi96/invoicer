import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_DEPOSIT_PERCENT } from "@/lib/stripe";
import { customerAllowsCard } from "@/lib/payment-methods";

/**
 * Public, token-gated. Customer accepts a quote AND pays a deposit by card:
 *   1. Convert the quote into a full invoice (status 'sent').
 *   2. Mint a deposit CHILD invoice (parent_invoice_id = full invoice) for the
 *      business's deposit %. The existing trg_reconcile_parent_invoice trigger
 *      rolls the child's payment up to the parent automatically.
 *   3. Mark the quote accepted + linked.
 *   4. Return a redirect to the existing /api/stripe/checkout for the deposit
 *      invoice — reusing all the Checkout + webhook + receipt machinery.
 *
 * Idempotent-ish: if the quote is already accepted with a linked invoice, we
 * reuse it and any existing unpaid deposit child rather than minting duplicates.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mintInvoiceNumber(sb: any, businessId: string): Promise<string> {
  // Manual read-increment (the atomic RPC checks auth.uid(), unavailable here).
  const { data: biz } = await tbl(sb, "businesses")
    .select("invoice_prefix, invoice_next_number")
    .eq("id", businessId)
    .single();
  const next = biz?.invoice_next_number ?? 1;
  await tbl(sb, "businesses").update({ invoice_next_number: next + 1 }).eq("id", businessId);
  return `${biz?.invoice_prefix ?? "INV"}-${String(next).padStart(4, "0")}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const sb = createAdminClient();

  // Validate portal token.
  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const { data: quote } = await tbl(sb, "quotes")
    .select("*")
    .eq("id", id)
    .eq("business_id", link.business_id)
    .eq("customer_id", link.customer_id)
    .maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (quote.status === "rejected" || quote.status === "expired") {
    return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });
  }

  // Business must have card payments enabled + a deposit configured.
  const { data: business } = await tbl(sb, "businesses")
    .select("stripe_account_id, stripe_charges_enabled, deposit_percent")
    .eq("id", link.business_id)
    .single();
  if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
    return NextResponse.json({ error: "Card payments aren't enabled for this business" }, { status: 400 });
  }
  const depositPct = business.deposit_percent != null ? Number(business.deposit_percent) : DEFAULT_DEPOSIT_PERCENT;
  if (!(depositPct > 0)) {
    return NextResponse.json({ error: "Deposits aren't enabled for this business" }, { status: 400 });
  }

  // Enforce the per-customer allow-list — card may be disabled for this customer.
  const { data: cust } = await tbl(sb, "customers")
    .select("allowed_payment_methods").eq("id", link.customer_id).maybeSingle();
  if (!customerAllowsCard(cust?.allowed_payment_methods)) {
    return NextResponse.json({ error: "Card payment isn't available for this account" }, { status: 403 });
  }

  const quoteTotal = Number(quote.total ?? 0);
  if (quoteTotal <= 0) return NextResponse.json({ error: "Quote has no payable total" }, { status: 400 });
  const depositAmount = Math.round((quoteTotal * depositPct) / 100 * 100) / 100;

  // 1) Reuse an existing converted invoice, or convert the quote now.
  let parentInvoiceId: string | null = quote.invoice_id ?? null;
  let parentNumber: string | null = null;

  if (parentInvoiceId) {
    const { data: existingParent } = await tbl(sb, "invoices")
      .select("id, number").eq("id", parentInvoiceId).eq("business_id", link.business_id).maybeSingle();
    parentNumber = existingParent?.number ?? null;
    if (!existingParent) parentInvoiceId = null; // stale link — re-create
  }

  if (!parentInvoiceId) {
    const number = await mintInvoiceNumber(sb, link.business_id);
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
    const { data: parent, error: pErr } = await tbl(sb, "invoices").insert({
      user_id: quote.user_id,
      business_id: link.business_id,
      number,
      status: "sent",
      customer_id: quote.customer_id,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: dueDate.toISOString().split("T")[0],
      line_items: quote.line_items,
      subtotal: quote.subtotal,
      discount_type: quote.discount_type,
      discount_value: quote.discount_value,
      discount_amount: quote.discount_amount,
      tax_total: quote.tax_total,
      total: quote.total,
      amount_paid: 0,
      notes: quote.notes,
      terms: quote.terms,
      site_id: quote.site_id ?? null,
      property_address: quote.property_address ?? null,
    }).select("id, number").single();
    if (pErr || !parent) {
      return NextResponse.json({ error: pErr?.message ?? "Couldn't create invoice" }, { status: 500 });
    }
    parentInvoiceId = parent.id;
    parentNumber = parent.number;
    await tbl(sb, "quotes").update({ invoice_id: parent.id, status: "accepted", updated_at: new Date().toISOString() }).eq("id", id);
  } else if (quote.status !== "accepted") {
    await tbl(sb, "quotes").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", id);
  }

  // 2) Reuse an existing unpaid deposit child, or mint one.
  let depositInvoiceId: string | null = null;
  const { data: existingChildren } = await tbl(sb, "invoices")
    .select("id, status, amount_paid, total")
    .eq("parent_invoice_id", parentInvoiceId)
    .eq("business_id", link.business_id);
  const reusable = (existingChildren ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c.status !== "paid" && Number(c.amount_paid ?? 0) < Number(c.total ?? 0) - 0.01,
  );
  if (reusable) {
    depositInvoiceId = reusable.id;
  } else {
    const depNumber = await mintInvoiceNumber(sb, link.business_id);
    const { data: child, error: cErr } = await tbl(sb, "invoices").insert({
      user_id: quote.user_id,
      business_id: link.business_id,
      number: depNumber,
      status: "sent",
      customer_id: quote.customer_id,
      issue_date: new Date().toISOString().split("T")[0],
      due_date: new Date().toISOString().split("T")[0],
      line_items: [{
        id: "deposit",
        name: `Deposit (${depositPct}%)`,
        description: `${depositPct}% deposit for invoice ${parentNumber ?? ""}`.trim(),
        quantity: 1,
        unit_price: depositAmount,
        tax_rate: 0,
        discount_percent: 0,
        subtotal: depositAmount,
        tax_amount: 0,
        total: depositAmount,
      }],
      subtotal: depositAmount,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_total: 0,
      total: depositAmount,
      amount_paid: 0,
      notes: `Deposit for ${parentNumber ?? "invoice"} (from quote ${quote.number}).`,
      parent_invoice_id: parentInvoiceId,
    }).select("id").single();
    if (cErr || !child) {
      return NextResponse.json({ error: cErr?.message ?? "Couldn't create deposit invoice" }, { status: 500 });
    }
    depositInvoiceId = child.id;
  }

  // 3) Hand off to the existing Stripe checkout for the deposit invoice.
  const redirect = `/api/stripe/checkout?invoice=${depositInvoiceId}&token=${token}`;
  return NextResponse.json({ ok: true, redirect });
}
