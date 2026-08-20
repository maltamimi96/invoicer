import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  // Forward the URL path as a header so server components / layouts can make
  // routing decisions (workers get redirected away from non-allowed paths).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth");

  /**
   * The one auth route a signed-in user must be allowed to stay on.
   *
   * A password reset link lands on /auth/callback, which exchanges the code for
   * a REAL session before forwarding here. So the recovery visit always arrives
   * holding a session, and the "signed in? go to /dashboard" bounce fired every
   * single time: the reset page was unreachable, and the emailed link silently
   * behaved as a passwordless sign-in that left the forgotten — or compromised
   * — password still live.
   *
   * Only the signed-in bounce is exempted, not the signed-out one: someone
   * arriving with an expired link and no session should still reach the page
   * that tells them so, rather than a login screen that explains nothing.
   */
  const isPasswordReset = pathname === "/auth/reset-password";

  // Endpoints that authenticate themselves via an Authorization: Bearer
  // header (mobile clients) — let the route handler do its own auth check
  // instead of cookie-redirecting them to the login page (which produces
  // an HTML response and breaks the mobile JSON parser).
  const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  const isBearerAuthRoute =
    pathname.startsWith("/api/mobile/") ||
    pathname === "/api/ai/transcribe";

  const isPublicRoute =
    // The public site. `/` is here so a stranger sees the home page instead of
    // being bounced to login; the page itself sends signed-in users to their
    // dashboard, which is what `/` used to do for everyone.
    pathname === "/" ||
    pathname === "/trades" ||
    pathname === "/agencies" ||
    pathname === "/pricing" ||
    pathname === "/contact-sales" ||
    pathname === "/api/marketing/contact" ||
    pathname === "/privacy" ||
    pathname === "/support" ||
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/portal/") ||
    pathname.startsWith("/api/portal/") ||
    // Public online-booking surface: hosted page + embed + slug-scoped API.
    // These own their tenant resolution (by slug) and bot protection.
    pathname.startsWith("/book/") ||
    pathname.startsWith("/booking/") ||
    // Public form builder: hosted form, iframe embed, and public submit/upload.
    pathname.startsWith("/f/") ||
    pathname.startsWith("/embed/") ||
    pathname.startsWith("/api/f/") ||
    // Instant-audit lead magnet: public landing page + submit.
    pathname.startsWith("/audit/") ||
    pathname.startsWith("/api/audit/") ||
    // Prospect outreach unsubscribe (public, token-gated).
    pathname.startsWith("/unsubscribe/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/auth/signup" ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/cron/") ||
    // MCP server authenticates itself via the inv_* API key (the mcp-handler
    // auth wrapper returns 401 on its own). Let every method through —
    // including the unauthenticated discovery / OPTIONS preflight.
    pathname.startsWith("/api/mcp") ||
    // OAuth 2.1 authorization-server endpoints + RFC 8414/9728 metadata for
    // the claude.ai connector. /authorize reads the session cookie itself and
    // redirects to login when needed, so it must not be auto-redirected here.
    pathname.startsWith("/api/oauth/") ||
    pathname.startsWith("/.well-known/") ||
    // Stripe webhook (signed, owns its auth) + token-gated public Checkout route.
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/stripe/checkout" ||
    pathname === "/api/stripe/save-card" ||
    // Revolut payment provider — signed webhook + token-gated hosted checkout.
    pathname === "/api/revolut/webhook" ||
    pathname === "/api/revolut/checkout" ||
    // Customer-facing card setup — gated by a portal token, not a session.
    pathname === "/api/revolut/save-card" ||
    // Resend delivery webhook (verifies its own Svix signature). Without this it
    // was 307'd to /auth/login, so delivered/bounced events never reached the
    // handler and every email stayed frozen at "Sent (in transit)".
    pathname === "/api/webhooks/resend" ||
    // VoIPcloud PBX call events. Authenticates itself: the business is keyed by
    // the unguessable token in the path, and the configured shared secret is
    // checked against the X-Pbx-Token header.
    pathname.startsWith("/api/webhooks/voipcloud/") ||
    (isBearerAuthRoute && hasBearer) ||
    (pathname.startsWith("/api/pdf/") && new URL(request.url).searchParams.get("token") !== null);

  // Public / self-authenticating routes never need the session check — return
  // before touching Supabase auth at all. This keeps portal/booking/form/cron
  // traffic (and Next's link prefetches to them) off the auth server entirely.
  if (isPublicRoute) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() resolves the session (refreshing expiring tokens — the
  // middleware's real job) and verifies the JWT *locally* via cached JWKS when
  // the project uses asymmetric signing keys — no per-request round trip to
  // the auth server, unlike getUser(). On legacy symmetric keys it falls back
  // to a network check, which is still correct, just slower. The redirect
  // below is UX only — RLS remains the actual security gate on every query.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (claims && isAuthRoute && !isPasswordReset) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
