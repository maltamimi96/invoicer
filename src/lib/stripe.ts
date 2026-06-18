/**
 * Stripe client + amount helpers.
 *
 * We use Stripe Connect Standard — each business links their own Stripe
 * account, and customers pay direct into it via Checkout. A platform fee
 * (application_fee_amount) is taken on each charge.
 *
 * Lazy-init so importing this file in code paths without STRIPE_SECRET_KEY
 * (e.g. the typecheck) doesn't blow up.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // apiVersion is set on the client; pin it explicitly so a future SDK bump
  // doesn't silently change request shapes mid-flight.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" as any });
  return _stripe;
}

// Stripe expects integer amounts in the currency's smallest unit. Most
// currencies are 2-decimal (multiply by 100). Zero-decimal currencies (JPY
// etc.) take the integer value directly. Three-decimal currencies are billed
// to the nearest 10 (Stripe quirk) — we'll round to 2dp then *1000 for them.
const ZERO_DECIMAL = new Set([
  "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF",
]);
const THREE_DECIMAL = new Set(["BHD","JOD","KWD","OMR","TND"]);

export function toStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(amount);
  if (THREE_DECIMAL.has(c)) return Math.round(amount * 1000 / 10) * 10;
  return Math.round(amount * 100);
}

export function fromStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return amount;
  if (THREE_DECIMAL.has(c)) return amount / 1000;
  return amount / 100;
}

/** Deposit % to use when a business hasn't set one (quote-accept deposits). */
export const DEFAULT_DEPOSIT_PERCENT = 50;

/** Default platform fee percent. NULL on a business row → use this. */
export function defaultPlatformFeePercent(): number {
  const raw = process.env.STRIPE_PLATFORM_FEE_PERCENT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/** Compute the application fee for a given total in the business currency. */
export function computeApplicationFeeAmount(
  amount: number,
  currency: string,
  businessFeePercent: number | null,
): number {
  const pct = businessFeePercent ?? defaultPlatformFeePercent();
  if (pct <= 0) return 0;
  const fee = (amount * pct) / 100;
  return toStripeAmount(fee, currency);
}
