import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReport } from "@/lib/actions/reports";
import { getBusiness } from "@/lib/actions/business";
import type { Report, Business } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const portalToken = url.searchParams.get("token");

  try {
    let reportData: Report & { customers: unknown };
    let business:   Business;

    if (portalToken) {
      // Customer portal access — validate the token covers this report's
      // customer + business, then fetch via admin client (no auth session).
      const sb = createAdminClient();
      const { data: link } = await tbl(sb, "customer_portal_tokens")
        .select("business_id, customer_id, expires_at, revoked_at")
        .eq("token", portalToken)
        .maybeSingle();
      if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      }
      const [{ data: r }, { data: biz }] = await Promise.all([
        tbl(sb, "reports").select("*, customers(*)").eq("id", id).eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle(),
        tbl(sb, "businesses").select("*").eq("id", link.business_id).single(),
      ]);
      if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
      reportData = r;
      business   = biz;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const [reportRes, bizRes] = await Promise.all([getReport(id), getBusiness()]);
      reportData = reportRes;
      business   = bizRes;
    }

    // react-pdf can't reliably load remote images during a server-rendered
    // stream — fetch the logo and embed as a data URL so it actually shows.
    let logoDataUrl: string | null = null;
    if (business.logo_url) {
      try {
        const res = await fetch(business.logo_url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ct  = res.headers.get("content-type") ?? "image/png";
          logoDataUrl = `data:${ct};base64,${buf.toString("base64")}`;
        }
      } catch { /* fall back to nothing — header renders the business name */ }
    }

    const { renderToStream } = await import("@react-pdf/renderer");
    const { ReportPdfDocument } = await import("@/components/reports/report-pdf-document");
    const React = await import("react");

    const element = React.createElement(ReportPdfDocument, {
      report: reportData,
      business,
      logoDataUrl,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = reportData.title.replace(/[^a-z0-9]/gi, "_") + ".pdf";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Report PDF]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
