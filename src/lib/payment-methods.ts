/**
 * Per-customer payment-method control.
 *
 * `customers.allowed_payment_methods` is NULL by default — meaning "offer every
 * method the business supports" (card if Stripe is connected, bank transfer if
 * bank details are filled). When set to an explicit list, ONLY those methods are
 * offered to that customer (e.g. ['cash'] = cash only, no card button).
 *
 * 'cash' is opt-in: it only ever shows when explicitly listed, so the default
 * (NULL) behaviour is unchanged from before this feature.
 */

export const PAYMENT_METHODS = ["card", "bank_transfer", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  // NOT "Card (Stripe)". This one permission governs every card provider the
  // business has connected — Stripe, Revolut, or both. Naming one of them made
  // it look as though Revolut couldn't be offered to a customer at all.
  card: "Card / online payment",
  bank_transfer: "Bank transfer",
  cash: "Cash / in person",
};

/** Which provider will actually serve a card payment — so the toggle says what
 *  it does instead of leaving the business to guess. */
export function cardProvidersLabel(opts: {
  stripeEnabled: boolean;
  revolutEnabled?: boolean;
}): string {
  const names = [
    opts.stripeEnabled ? "Stripe" : null,
    opts.revolutEnabled ? "Revolut" : null,
  ].filter(Boolean) as string[];
  if (names.length === 0) {
    return "No card provider is connected yet — connect Stripe or Revolut under Settings → Payments.";
  }
  return `Card payments go through ${names.join(" and ")}.`;
}

export interface OfferedPaymentMethods {
  /** Stripe card checkout. */
  card: boolean;
  /** Revolut hosted checkout (card + Revolut Pay). Uses the same "card"
   *  permission as Stripe, but a separate provider gate — so it can be offered
   *  even when Stripe isn't connected. */
  revolut: boolean;
  bank_transfer: boolean;
  cash: boolean;
}

/**
 * Resolve which payment methods to actually offer on an invoice/quote, given
 * the customer's allow-list and what the business can support.
 */
export function resolveOfferedMethods(opts: {
  /** customer.allowed_payment_methods — NULL/empty = all available. */
  allowed: string[] | null | undefined;
  /** business has Stripe charges enabled. */
  stripeEnabled: boolean;
  /** business has Revolut enabled. */
  revolutEnabled?: boolean;
  /** business has bank-transfer details filled in. */
  hasBankDetails: boolean;
}): OfferedPaymentMethods {
  const list = opts.allowed && opts.allowed.length ? new Set(opts.allowed) : null;
  // NULL allow-list → inherit (everything the business supports). Explicit list
  // → only what's named.
  const permits = (m: PaymentMethod) => (list ? list.has(m) : true);
  return {
    card: opts.stripeEnabled && permits("card"),
    revolut: !!opts.revolutEnabled && permits("card"),
    bank_transfer: opts.hasBankDetails && permits("bank_transfer"),
    // Cash is opt-in only: never shown unless explicitly allow-listed.
    cash: list ? list.has("cash") : false,
  };
}

/** True when the customer may pay this invoice/quote by card. */
export function customerAllowsCard(allowed: string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true; // NULL = inherit (allowed)
  return allowed.includes("card");
}
