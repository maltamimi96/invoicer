import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInvoice } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");

  try {
    // Two paths: tokenised (customer email Download button — no auth, validate
    // the portal token then fetch via the admin client) or signed-in user.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let inv: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let business: any;

    if (token) {
      const sb = createAdminClient();
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

      const [{ data: invData }, { data: bizData }, { data: cust }] = await Promise.all([
        tbl(sb, "invoices")
          .select("*")
          .eq("id", id)
          .eq("business_id", link.business_id)
          .eq("customer_id", link.customer_id)
          .maybeSingle(),
        tbl(sb, "businesses").select("*").eq("id", link.business_id).maybeSingle(),
        tbl(sb, "customers").select("*").eq("id", link.customer_id).maybeSingle(),
      ]);

      if (!invData) return NextResponse.json({ error: "Not found" }, { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inv = { ...(invData as any), customers: cust ?? null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      business = bizData as any;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const [invoiceData, biz] = await Promise.all([getInvoice(id), getBusiness()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inv = invoiceData as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      business = biz as any;
    }

    const customer = inv.customers ?? null;
    const lineItems = inv.line_items ?? [];

    // Dynamic import to avoid SSR issues
    const { renderToStream } = await import("@react-pdf/renderer");
    const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
    const React = await import("react");

    const element = React.createElement(InvoicePDFDocument, {
      invoice: inv,
      customer,
      business,
      lineItems,
      pdfSettings: business.pdf_settings ?? null,
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
        "Content-Disposition": `attachment; filename="${inv.number}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
