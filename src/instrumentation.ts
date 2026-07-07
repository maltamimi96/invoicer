/**
 * Sentry — server-side error monitoring, GATED on the SENTRY_DSN env var.
 *
 * Deliberately inert until a DSN is set. With no SENTRY_DSN, both hooks below
 * return before ever importing @sentry/nextjs, so there is zero runtime cost —
 * and because the SDK is ONLY ever dynamically imported inside these server
 * hooks (never statically, never in a client component), it adds zero weight to
 * the client bundle. The moment a DSN is added to the Vercel env
 * (Production → Settings → Environment Variables) it activates on the next
 * deploy with no code change and nothing to handle in chat.
 *
 * Scope is intentionally server + edge only: the production fires this app hits
 * are serverless 500s (Postgres codes, RSC render errors) — all server-side.
 *
 * To enable: set SENTRY_DSN (and optionally SENTRY_TRACES_SAMPLE_RATE, default
 * 0.1) on the Vercel project, then redeploy. Nothing else required.
 */

// Param types are derived from Sentry's own captureRequestError so the call
// below always typechecks without depending on Next's internal type paths.
type RequestErrorArgs = Parameters<
  typeof import("@sentry/nextjs").captureRequestError
>;

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== "nodejs" && runtime !== "edge") return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Conservative default; raise via SENTRY_TRACES_SAMPLE_RATE if needed.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Don't ship user PII to Sentry unless deliberately turned on.
    sendDefaultPii: false,
  });
}

export async function onRequestError(...args: RequestErrorArgs) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
