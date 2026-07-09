import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (s: any, n: string) => s.from(n);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let report: any;
    const admin = createAdminClient();

    if (token) {
      const { data: link } = await tbl(admin, "customer_portal_tokens")
        .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
      if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 401 });
      const { data } = await tbl(admin, "seo_reports").select("*, seo_sites(domain, customer_id)").eq("id", id).eq("business_id", link.business_id).maybeSingle();
      if (!data || data.seo_sites?.customer_id !== link.customer_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
      report = data;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const { data } = await tbl(supabase, "seo_reports").select("*, seo_sites(domain, customer_id)").eq("id", id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      report = data;
    }

    const [{ data: business }, { data: customer }] = await Promise.all([
      tbl(admin, "businesses").select("*").eq("id", report.business_id).maybeSingle(),
      report.seo_sites?.customer_id
        ? tbl(admin, "customers").select("name").eq("id", report.seo_sites.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const { renderToStream } = await import("@react-pdf/renderer");
    const { SeoReportPDFDocument } = await import("@/components/seo/seo-report-pdf-document");
    const React = await import("react");

    const element = React.createElement(SeoReportPDFDocument, {
      report, business, siteDomain: report.seo_sites?.domain ?? "", clientName: customer?.name ?? null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    return new NextResponse(Buffer.concat(chunks), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="seo-report.pdf"` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seo-report PDF]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
