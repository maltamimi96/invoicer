import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Serves a contract's signed PDF. Accepts a portal ?token= or an authed user. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  const admin = createAdminClient();

  let businessId: string | null = null;
  // A portal token belongs to ONE customer, so it may only open that customer's
  // contract. Scoping to the business alone let any customer of X download any
  // other customer of X's signed PDF — which carries the other party's name,
  // signing timestamp and IP address on its certificate page. The invoice,
  // quote and report routes already narrow by customer_id; this one didn't.
  let tokenCustomerId: string | null = null;
  if (token) {
    const { data: link } = await tbl(admin, "customer_portal_tokens")
      .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 401 });
    businessId = link.business_id;
    tokenCustomerId = link.customer_id ?? null;
    // A token with no customer identifies nobody, so it can't authorise anyone.
    if (!tokenCustomerId) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    businessId = await getActiveBizId(supabase, user.id);
  }

  let q = tbl(admin, "contracts")
    .select("title, signed_path").eq("id", id).eq("business_id", businessId);
  if (tokenCustomerId) q = q.eq("customer_id", tokenCustomerId);
  const { data: c } = await q.maybeSingle();
  if (!c?.signed_path) return NextResponse.json({ error: "Signed copy not available" }, { status: 404 });

  const { data: blob, error } = await admin.storage.from("contracts").download(c.signed_path);
  if (error || !blob) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${(c.title || "contract").replace(/[^a-z0-9]+/gi, "-")}-signed.pdf"` },
  });
}
