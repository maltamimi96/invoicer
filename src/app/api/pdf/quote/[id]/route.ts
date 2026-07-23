import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuote } from "@/lib/actions/quotes";
import { getBusiness } from "@/lib/actions/business";
import { resolveDocumentConfig } from "@/lib/documents/resolve";
import { registerPdfFonts } from "@/lib/documents/template-config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");

  try {
    // Two paths: tokenised (customer portal "Download" link — no auth, validate
    // the portal token then fetch via the admin client) or signed-in user.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quote: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let business: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let customer: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolverSb: any;

    if (token) {
      const sb = createAdminClient();
      resolverSb = sb;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (s: any, n: string) => s.from(n);

      const { data: link } = await tbl(sb, "customer_portal_tokens")
        .select("business_id, customer_id, expires_at, revoked_at")
        .eq("token", token)
        .maybeSingle();

      if (!link || link.revoked_at) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      }

      const [{ data: q }, { data: biz }, { data: cust }] = await Promise.all([
        tbl(sb, "quotes")
          .select("*")
          .eq("id", id)
          .eq("business_id", link.business_id)
          .eq("customer_id", link.customer_id)
          .maybeSingle(),
        tbl(sb, "businesses").select("*").eq("id", link.business_id).maybeSingle(),
        tbl(sb, "customers").select("*").eq("id", link.customer_id).maybeSingle(),
      ]);

      if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
      quote = q;
      business = biz;
      customer = cust;
    } else {
      const supabase = await createClient();
      resolverSb = supabase;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const [quoteData, biz] = await Promise.all([getQuote(id), getBusiness()]);
      quote = quoteData;
      business = biz;
      customer = (quoteData as { customers?: unknown }).customers ?? null;
    }

    const lineItems = quote.line_items ?? [];

    const previewTemplateId = token ? null : req.nextUrl.searchParams.get("template");
    const config = await resolveDocumentConfig(resolverSb, {
      businessId: business.id,
      docType: "quote",
      templateId: previewTemplateId ?? quote.template_id ?? null,
      pdfSettings: business?.pdf_settings ?? null,
    });

    const { renderToStream, Font } = await import("@react-pdf/renderer");
    const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
    const React = await import("react");
    registerPdfFonts(Font);

    const element = React.createElement(QuotePDFDocument, {
      quote,
      customer,
      business,
      lineItems,
      config,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quote.number}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF/Quote]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
