import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const biz = searchParams.get("biz");
  const email = searchParams.get("email");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Bounce to login so we can finish activation after auth. Prefill the
    // email so an existing-team-member invite doesn't make them re-type it.
    const loginUrl = new URL("/auth/login", request.url);
    if (biz) loginUrl.searchParams.set("biz", biz);
    if (email) loginUrl.searchParams.set("email", email);
    return NextResponse.redirect(loginUrl);
  }

  // Activate any pending memberships for this user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc("activate_pending_memberships");

  if (biz) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Check ownership
    const { data: owned } = await sb
      .from("businesses")
      .select("id")
      .eq("id", biz)
      .eq("user_id", user.id)
      .maybeSingle();

    let hasAccess = !!owned;

    if (!hasAccess) {
      // Check active membership (just activated above)
      const { data: member } = await sb
        .from("business_members")
        .select("business_id")
        .eq("business_id", biz)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      hasAccess = !!member;
    }

    if (hasAccess) {
      const cookieStore = await cookies();
      cookieStore.set("active_business_id", biz, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
