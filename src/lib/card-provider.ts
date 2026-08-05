/**
 * Which provider takes a business's card payments.
 *
 * Kirei supports Stripe and Revolut side by side rather than one at a time.
 * That matters because saved cards are NOT portable: a token stored with
 * Stripe cannot be charged through Revolut, or vice versa. If switching
 * provider silently repointed everything, every card already on file would
 * quietly stop working — and you'd only find out when an autopay run failed.
 *
 * So a customer can hold a card with each, and a charge uses whichever token
 * matches the provider being used.
 *
 * Plain module — safe to import from actions, routes and crons.
 */

export type CardProvider = "stripe" | "revolut";

export interface ProviderState {
  /** The business's explicit choice: 'auto' | 'stripe' | 'revolut'. */
  card_provider?: string | null;
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  revolut_enabled?: boolean | null;
  revolut_secret_enc?: string | null;
}

/** Is Stripe genuinely able to take a payment right now? */
export function stripeReady(b: ProviderState): boolean {
  // details_submitted is not enough — Stripe can hold an account with details
  // in and charges still disabled, which is exactly the state that looks
  // connected in the UI while every payment fails.
  return Boolean(b.stripe_account_id && b.stripe_charges_enabled);
}

export function revolutReady(b: ProviderState): boolean {
  return Boolean(b.revolut_enabled && b.revolut_secret_enc);
}

/**
 * The provider to use, or null when the business can't take cards at all.
 *
 * 'auto' prefers Stripe when it's genuinely ready, so nothing changes for
 * businesses already running on it; it falls through to Revolut otherwise.
 * An explicit choice is honoured even if that provider isn't ready — the
 * caller then reports why, rather than silently charging through the other
 * one, which would land the money in an account the user didn't expect.
 */
export function resolveCardProvider(b: ProviderState): CardProvider | null {
  const choice = (b.card_provider ?? "auto").toLowerCase();
  if (choice === "stripe") return "stripe";
  if (choice === "revolut") return "revolut";
  if (stripeReady(b)) return "stripe";
  if (revolutReady(b)) return "revolut";
  return null;
}

/** A sentence explaining why cards aren't available, for the UI. */
export function cardProviderProblem(b: ProviderState): string | null {
  const provider = resolveCardProvider(b);
  if (!provider) {
    return "No card provider is connected. Connect Stripe or Revolut in Settings → Payments.";
  }
  if (provider === "stripe" && !stripeReady(b)) {
    return b.stripe_account_id
      ? "Stripe has your details but hasn't enabled charges yet — check your Stripe dashboard for a verification request."
      : "Stripe isn't connected yet.";
  }
  if (provider === "revolut" && !revolutReady(b)) {
    return "Revolut isn't connected yet — add your Merchant API key in Settings → Payments.";
  }
  return null;
}
