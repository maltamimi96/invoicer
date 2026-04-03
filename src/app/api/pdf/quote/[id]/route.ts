import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/actions/quotes";
import { getBusiness } from "@/lib/actions/business";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [quoteData, business] = await Promise.all([getQuote(id), getBusiness()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote = quoteData as any;
    const customer = quote.customers ?? null;
    const lineItems = quote.line_items ?? [];

    const { renderToStream } = await import("@react-pdf/renderer");
    const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
    const React = await import("react");

    const element = React.createElement(QuotePDFDocument, {
      quote,
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
        "Content-Disposition": `attachment; filename="${quote.number}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF/Quote]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
