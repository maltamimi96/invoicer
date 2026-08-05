import { describe, it, expect } from "vitest";
import { resolveCardProvider, stripeReady, revolutReady, cardProviderProblem } from "@/lib/card-provider";

const stripeLive = { stripe_account_id: "acct_1", stripe_charges_enabled: true };
const stripePending = { stripe_account_id: "acct_1", stripe_charges_enabled: false };
const revolutLive = { revolut_enabled: true, revolut_secret_enc: "enc" };

describe("stripeReady", () => {
  it("requires charges to actually be enabled, not just an account", () => {
    // The real state on this account: details submitted, charges disabled.
    // Treating that as "connected" is why payments appeared to work and didn't.
    expect(stripeReady(stripeLive)).toBe(true);
    expect(stripeReady(stripePending)).toBe(false);
    expect(stripeReady({})).toBe(false);
  });
});

describe("revolutReady", () => {
  it("needs both the toggle and a stored key", () => {
    expect(revolutReady(revolutLive)).toBe(true);
    expect(revolutReady({ revolut_enabled: true })).toBe(false);
    expect(revolutReady({ revolut_secret_enc: "enc" })).toBe(false);
  });
});

describe("resolveCardProvider", () => {
  it("prefers Stripe on auto when it is genuinely ready", () => {
    expect(resolveCardProvider({ ...stripeLive, ...revolutLive })).toBe("stripe");
  });

  it("falls through to Revolut when Stripe is connected but not enabled", () => {
    // The exact situation that prompted this: an account Stripe hasn't approved.
    expect(resolveCardProvider({ ...stripePending, ...revolutLive })).toBe("revolut");
  });

  it("returns null when neither can take a payment", () => {
    expect(resolveCardProvider({})).toBeNull();
    expect(resolveCardProvider(stripePending)).toBeNull();
  });

  it("honours an explicit choice even when that provider isn't ready", () => {
    // Silently charging through the OTHER provider would put the money in an
    // account the user didn't choose. Better to honour it and report why.
    expect(resolveCardProvider({ card_provider: "revolut", ...stripeLive })).toBe("revolut");
    expect(resolveCardProvider({ card_provider: "stripe", ...stripePending, ...revolutLive })).toBe("stripe");
  });

  it("treats auto as the default when unset", () => {
    expect(resolveCardProvider({ card_provider: null, ...revolutLive })).toBe("revolut");
  });
});

describe("cardProviderProblem", () => {
  it("says nothing when a provider is ready", () => {
    expect(cardProviderProblem(stripeLive)).toBeNull();
    expect(cardProviderProblem(revolutLive)).toBeNull();
  });

  it("names the Stripe pending-verification case specifically", () => {
    const msg = cardProviderProblem({ card_provider: "stripe", ...stripePending });
    expect(msg).toMatch(/hasn't enabled charges/);
  });

  it("tells an unconnected business what to do", () => {
    expect(cardProviderProblem({})).toMatch(/Connect Stripe or Revolut/);
  });
});
