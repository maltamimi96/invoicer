/**
 * Idempotency keys for money-creating Stripe calls.
 *
 * ---------------------------------------------------------------------------
 * WHY
 *
 * Recording a payment is idempotent — `payments (business_id,
 * provider_payment_id)` carries a unique index. CREATING one was not. Two
 * `paymentIntents.create` calls produce two PaymentIntents with two different
 * ids; both succeed at Stripe, both pass the uniqueness check on the way in,
 * and both get recorded. The database ends up perfectly consistent and the
 * customer has been charged twice. The unique index protects against duplicate
 * ROWS, which is a different thing from duplicate CHARGES.
 *
 * There is no refund instrument in this product, so an accidental double charge
 * cannot be undone from inside it.
 *
 * ---------------------------------------------------------------------------
 * THE DAILY BUCKET, AND WHY IT IS NOT ARBITRARY
 *
 * Keys carry a date component, so the protection covers "the same charge, on
 * the same invoice, for the same amount, on the same day". A genuine second
 * charge matching all four returns the first PaymentIntent instead of charging
 * again. For an invoice that is a duplicate, not a legitimate action — you do
 * not intentionally pay one invoice twice for the same amount on one day.
 *
 * Stripe expires idempotency keys after 24 hours regardless, so a key without a
 * date component is not actually permanent — its protection just lapses on a
 * rolling window instead of a predictable one. The daily bucket is the honest
 * granularity rather than a weaker choice.
 *
 * The exception is `customers.create`, which carries no date: a Stripe customer
 * should be created once, ever.
 *
 * NOTE: Stripe scopes idempotency keys per connected account when
 * `stripeAccount` is passed, which is the behaviour wanted here — two tenants
 * cannot collide on a key.
 */

/**
 * A key must be stable for the same logical operation and different for a
 * genuinely different one. Everything below is a pure function of its inputs so
 * it can be unit-tested without Stripe, a database, or a network.
 */

/** UTC day stamp. UTC, not local, so a server timezone change cannot silently widen the window. */
export function dayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Stripe caps idempotency keys at 255 characters. Everything here is built from
 * UUIDs and integers and lands far short of that, but the guard is cheap and
 * the failure mode without it (Stripe rejecting the whole charge) is bad.
 */
const MAX_KEY_LENGTH = 255;

function assertUsable(key: string): string {
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Idempotency key too long (${key.length} > ${MAX_KEY_LENGTH}): ${key.slice(0, 60)}…`);
  }
  return key;
}

/**
 * Off-session charge against a saved card (`paymentIntents.create`).
 *
 * Amount is in MINOR UNITS and must be the same value handed to Stripe — a key
 * derived from a rounded major-unit amount would collide across two charges
 * that differ by cents.
 */
export function chargeKey(invoiceId: string, amountMinorUnits: number, now?: Date): string {
  return assertUsable(`chg:${invoiceId}:${Math.round(amountMinorUnits)}:${dayStamp(now)}`);
}

/** Hosted Checkout session for paying an invoice (`checkout.sessions.create`, mode: payment). */
export function checkoutSessionKey(invoiceId: string, amountMinorUnits: number, now?: Date): string {
  return assertUsable(`cs:${invoiceId}:${Math.round(amountMinorUnits)}:${dayStamp(now)}`);
}

/**
 * Checkout session for saving a card (`checkout.sessions.create`, mode: setup).
 * No amount — nothing is charged.
 */
export function saveCardSessionKey(customerId: string, now?: Date): string {
  return assertUsable(`si:${customerId}:${dayStamp(now)}`);
}

/**
 * Stripe Customer creation. Deliberately has NO date component: a customer
 * should be created once and reused forever, so the key must never roll over.
 */
export function customerKey(businessId: string, customerId: string): string {
  return assertUsable(`cust:${businessId}:${customerId}`);
}
