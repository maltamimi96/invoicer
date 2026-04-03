import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInvoice } from "@/lib/actions/invoices";
import { getBusiness } from "@/lib/actions/business";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [invoiceData, business] = await Promise.all([getInvoice(id), getBusiness()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invoiceData as any;
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
