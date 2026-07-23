import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusiness } from "@/lib/actions/business";
import { DEFAULT_TEMPLATE_CONFIG, registerPdfFonts } from "@/lib/documents/template-config";
import type { TemplateConfig } from "@/lib/documents/template-config";

// Live preview for the template editor. POST { doc_type, config } → a PDF of a
// representative sample document rendered with that (possibly unsaved) config.
// Authenticated (editor only); returns inline PDF for an <iframe>/<embed>.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { doc_type?: "invoice" | "quote"; config?: Partial<TemplateConfig> };
    const docType = body.doc_type === "quote" ? "quote" : "invoice";
    const config: TemplateConfig = {
      ...DEFAULT_TEMPLATE_CONFIG,
      document_title: docType === "quote" ? "QUOTATION" : DEFAULT_TEMPLATE_CONFIG.document_title,
      ...(body.config ?? {}),
    };
    if (!Array.isArray(config.columns) || config.columns.length === 0) config.columns = DEFAULT_TEMPLATE_CONFIG.columns;
    if (!Array.isArray(config.custom_fields)) config.custom_fields = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const business = (await getBusiness()) as any;

    const sampleCustomer = {
      id: "sample", name: "Sample Customer Pty Ltd", company: "Sample Co", email: "customer@example.com",
      phone: "0400 000 000", address: "12 Example Street", city: "Sydney", postcode: "2000",
      country: "Australia", tax_number: "12 345 678 901",
    };
    const sampleItems = [
      { id: "1", name: "Labour — installation", description: "On-site work, 2 crew", quantity: 8, unit_price: 95, tax_rate: 10, total: 760 },
      { id: "2", name: "Materials", description: "Fixings, sealant, sundries", quantity: 1, unit_price: 240, tax_rate: 10, total: 240 },
      { id: "3", name: "Site clean-up", description: "", quantity: 1, unit_price: 120, tax_rate: 10, total: 120 },
    ];
    const subtotal = 1120, tax_total = 112, total = 1232;
    const today = new Date().toISOString();
    const later = new Date(Date.now() + 14 * 864e5).toISOString();

    const { renderToStream, Font } = await import("@react-pdf/renderer");
    const React = await import("react");
    registerPdfFonts(Font);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let element: any;
    if (docType === "quote") {
      const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
      element = React.createElement(QuotePDFDocument, {
        quote: { id: "sample", number: "QUO-0001", status: "sent", issue_date: today, expiry_date: later,
          subtotal, discount_amount: 0, tax_total, total, notes: "Thank you for the opportunity to quote.\nPrices held for 14 days.",
          terms: "50% deposit to commence.\nBalance on completion.", property_address: "12 Example Street, Sydney 2000" } as never,
        customer: sampleCustomer as never, business, lineItems: sampleItems as never, config,
      });
    } else {
      const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
      element = React.createElement(InvoicePDFDocument, {
        invoice: { id: "sample", number: "INV-0001", status: "sent", issue_date: today, due_date: later,
          subtotal, discount_amount: 0, tax_total, total, amount_paid: 0,
          notes: "Thank you for your business.", terms: "Payment due within 14 days.",
          property_address: "12 Example Street, Sydney 2000" } as never,
        customer: sampleCustomer as never, business, lineItems: sampleItems as never, config,
      });
    }

    const stream = await renderToStream(element);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return new NextResponse(Buffer.concat(chunks), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=preview.pdf", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF/preview]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
