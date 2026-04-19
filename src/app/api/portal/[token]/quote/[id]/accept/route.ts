import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const { data: quote } = await tbl(sb, "quotes")
    .select("id, status, customer_id, business_id")
    .eq("id", id)
    .eq("business_id", link.business_id)
    .eq("customer_id", link.customer_id)
    .maybeSingle();

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.status === "accepted") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (quote.status === "rejected" || quote.status === "expired") {
    return NextResponse.json({ error: `Quote is ${quote.status}` }, { status: 409 });
  }

  const { error } = await tbl(sb, "quotes")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
