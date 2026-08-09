import { describe, it, expect, afterEach } from "vitest";
import { hostRedirectTarget, marketingHostFor, isMarketingPath } from "./host-routing";

const APP = "app.kireihq.com";
const SITE = "kireihq.com";

function withAppHost<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_APP_HOST;
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_HOST;
  else process.env.NEXT_PUBLIC_APP_HOST = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_HOST;
    else process.env.NEXT_PUBLIC_APP_HOST = prev;
  }
}

afterEach(() => { delete process.env.NEXT_PUBLIC_APP_HOST; });

describe("inert until configured", () => {
  it("does nothing at all with no NEXT_PUBLIC_APP_HOST", () => {
    // This is the rollback: unset the variable and the split disappears.
    withAppHost(undefined, () => {
      for (const p of ["/", "/dashboard", "/trades", "/api/stripe/webhook"]) {
        expect(hostRedirectTarget(SITE, p)).toBeNull();
        expect(hostRedirectTarget(APP, p)).toBeNull();
      }
    });
  });
});

describe("splitting the two hosts", () => {
  it("sends app paths on the marketing host to the app", () => {
    withAppHost(APP, () => {
      expect(hostRedirectTarget(SITE, "/dashboard")).toBe(`https://${APP}/dashboard`);
      expect(hostRedirectTarget(SITE, "/invoices/123")).toBe(`https://${APP}/invoices/123`);
      expect(hostRedirectTarget(SITE, "/auth/login")).toBe(`https://${APP}/auth/login`);
      expect(hostRedirectTarget(SITE, "/onboarding")).toBe(`https://${APP}/onboarding`);
    });
  });

  it("sends marketing paths on the app host back to the site", () => {
    withAppHost(APP, () => {
      expect(hostRedirectTarget(APP, "/trades")).toBe(`https://${SITE}/trades`);
      expect(hostRedirectTarget(APP, "/pricing")).toBe(`https://${SITE}/pricing`);
    });
  });

  it("keeps the app's own root on the app host", () => {
    // app.kireihq.com/ must reach the dashboard, not bounce to the sales page.
    withAppHost(APP, () => {
      expect(hostRedirectTarget(APP, "/")).toBeNull();
    });
  });

  it("leaves marketing pages alone on the marketing host", () => {
    withAppHost(APP, () => {
      for (const p of ["/", "/trades", "/agencies", "/pricing", "/contact-sales"]) {
        expect(hostRedirectTarget(SITE, p)).toBeNull();
      }
    });
  });
});

describe("what must never be redirected", () => {
  it("never redirects /api — webhooks do not reliably follow them", () => {
    // Stripe and Revolut webhooks are registered against the current host. A
    // redirect on a POST is a payment that silently never gets recorded.
    withAppHost(APP, () => {
      for (const host of [SITE, APP]) {
        expect(hostRedirectTarget(host, "/api/stripe/webhook")).toBeNull();
        expect(hostRedirectTarget(host, "/api/revolut/webhook")).toBeNull();
        expect(hostRedirectTarget(host, "/api/cron/reminders")).toBeNull();
        expect(hostRedirectTarget(host, "/api/mcp")).toBeNull();
      }
    });
  });

  it("never redirects a link already out in the world", () => {
    // Portal links, booking pages, hosted forms and share links live in emails
    // we cannot go back and edit.
    withAppHost(APP, () => {
      for (const p of [
        "/portal/abc123", "/book/some-slug", "/f/enquiry", "/embed/enquiry",
        "/jobs/tok", "/invoice/tok", "/quote/tok", "/unsubscribe/tok",
        "/privacy", "/support", "/.well-known/oauth-authorization-server",
      ]) {
        expect(hostRedirectTarget(SITE, p)).toBeNull();
        expect(hostRedirectTarget(APP, p)).toBeNull();
      }
    });
  });
});

describe("www counts as the marketing host", () => {
  it("redirects app paths on www, not just the apex", () => {
    // The apex 307s to www, so www IS the public host. Matching only the apex
    // let /dashboard on www fall through to the login page instead of hopping
    // to the app - which is exactly what happened in production.
    withAppHost(APP, () => {
      expect(hostRedirectTarget(`www.${SITE}`, "/dashboard")).toBe(`https://${APP}/dashboard`);
      expect(hostRedirectTarget(`www.${SITE}`, "/auth/login")).toBe(`https://${APP}/auth/login`);
    });
  });

  it("still leaves marketing pages alone on www", () => {
    withAppHost(APP, () => {
      expect(hostRedirectTarget(`www.${SITE}`, "/pricing")).toBeNull();
      expect(hostRedirectTarget(`www.${SITE}`, "/")).toBeNull();
    });
  });
});

describe("other hosts are left alone", () => {
  it("ignores previews and localhost", () => {
    // A preview deployment must keep serving everything from one origin, or it
    // stops being testable — which is how this would ship unverified.
    withAppHost(APP, () => {
      expect(hostRedirectTarget("localhost:3000", "/dashboard")).toBeNull();
      expect(hostRedirectTarget("invoicer-abc123.vercel.app", "/dashboard")).toBeNull();
      expect(hostRedirectTarget("invoicer.crownroofers.com.au", "/dashboard")).toBeNull();
    });
  });

  it("ignores the port when matching", () => {
    withAppHost(APP, () => {
      expect(hostRedirectTarget(`${SITE}:443`, "/dashboard")).toBe(`https://${APP}/dashboard`);
    });
  });

  it("tolerates a missing Host header", () => {
    withAppHost(APP, () => {
      expect(hostRedirectTarget(null, "/dashboard")).toBeNull();
    });
  });
});

describe("helpers", () => {
  it("derives the marketing host from the app host", () => {
    expect(marketingHostFor("app.kireihq.com")).toBe("kireihq.com");
    expect(marketingHostFor("kireihq.com")).toBe("kireihq.com");
  });

  it("knows which paths are marketing", () => {
    expect(isMarketingPath("/pricing")).toBe(true);
    expect(isMarketingPath("/dashboard")).toBe(false);
  });
});
