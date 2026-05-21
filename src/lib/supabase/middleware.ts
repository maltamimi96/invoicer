import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  // Forward the URL path as a header so server components / layouts can make
  // routing decisions (workers get redirected away from non-allowed paths).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

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

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/auth");

  // Endpoints that authenticate themselves via an Authorization: Bearer
  // header (mobile clients) — let the route handler do its own auth check
  // instead of cookie-redirecting them to the login page (which produces
  // an HTML response and breaks the mobile JSON parser).
  const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  const isBearerAuthRoute =
    pathname.startsWith("/api/mobile/") ||
    pathname === "/api/ai/transcribe";

  const isPublicRoute =
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/portal/") ||
    pathname.startsWith("/api/portal/") ||
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
    (isBearerAuthRoute && hasBearer) ||
    (pathname.startsWith("/api/pdf/") && new URL(request.url).searchParams.get("token") !== null);

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
