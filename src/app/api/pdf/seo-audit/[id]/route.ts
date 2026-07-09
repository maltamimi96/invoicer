import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (s: any, n: string) => s.from(n);

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let audit: any;
    if (token) {
      const { data } = await tbl(admin, "seo_audits").select("*").eq("id", id).eq("view_token", token).maybeSingle();
      if (!data) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      audit = data;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const { data } = await tbl(supabase, "seo_audits").select("*").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      audit = data;
    }

    const { data: business } = await tbl(admin, "businesses").select("*").eq("id", audit.business_id).maybeSingle();

    const { renderToStream } = await import("@react-pdf/renderer");
    const { SeoAuditPDFDocument } = await import("@/components/seo/seo-audit-pdf-document");
    const React = await import("react");
    const element = React.createElement(SeoAuditPDFDocument, { url: audit.url, result: audit.result ?? {}, business });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return new NextResponse(Buffer.concat(chunks), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="seo-audit.pdf"` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seo-audit PDF]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
