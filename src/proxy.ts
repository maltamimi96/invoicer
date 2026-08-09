import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { hostRedirectTarget } from "@/lib/host-routing";

export async function proxy(request: NextRequest) {
  // Split the public site from the product by hostname, BEFORE the auth
  // middleware runs — otherwise a signed-out visitor hitting the app host is
  // bounced to login on the wrong origin. Inert until NEXT_PUBLIC_APP_HOST is
  // set, so this deploy changes nothing until the env var does.
  const target = hostRedirectTarget(
    request.headers.get("host"),
    request.nextUrl.pathname,
  );
  if (target) {
    const url = new URL(target);
    url.search = request.nextUrl.search;   // keep ?invite=, ?solution=, …
    // 307, not 308: a permanent redirect gets cached by browsers and would
    // outlive a rollback, stranding people on a host we had moved away from.
    return NextResponse.redirect(url, 307);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
