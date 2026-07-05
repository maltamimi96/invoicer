import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Serve a customer's own onboarding upload back to them (token-gated) —
 *  used for image previews on the portal fill page. Only paths inside this
 *  request's namespace are reachable. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const sb = createAdminClient();
  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 410 });

  const { data: request } = await tbl(sb, "onboarding_requests")
    .select("id").eq("id", id)
    .eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle();
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Uploads are namespaced businessId/requestId/… — refuse anything else.
  if (!path.startsWith(`${link.business_id}/${id}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: blob, error } = await sb.storage.from("onboarding-uploads").download(path);
  if (error || !blob) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buf, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
