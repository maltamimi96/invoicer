import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Serve a just-uploaded public-form image back for inline preview (slug-gated
 *  to the form's own namespace). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const sb = createAdminClient();
  const { data: form } = await tbl(sb, "public_forms").select("id, business_id, status").eq("slug", slug).maybeSingle();
  if (!form || form.status !== "published") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!path.startsWith(`${form.business_id}/${form.id}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: blob, error } = await sb.storage.from("public-form-uploads").download(path);
  if (error || !blob) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buf, { headers: { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "private, max-age=300" } });
}
