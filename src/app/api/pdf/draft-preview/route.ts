import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getActiveBizId } from "@/lib/active-business";
import { getBusiness } from "@/lib/actions/business";
import { resolveDocumentConfig } from "@/lib/documents/resolve";
import { registerPdfFonts } from "@/lib/documents/template-config";

// Live preview for the invoice/quote editor: renders the ACTUAL in-progress
// document (real line items, totals, customer) with the selected template — so
// the user sees exactly how their quote/invoice will look while building it.
// Authenticated; returns inline PDF for an <iframe>.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await getUser();
    const businessId = await getActiveBizId(supabase, user.id);

    const body = (await req.json()) as {
      doc_type?: "invoice" | "quote";
      template_id?: string | null;
      customer_id?: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc?: Record<string, any>;
    };
    const docType = body.doc_type === "quote" ? "quote" : "invoice";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const business = (await getBusiness()) as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let customer: any = null;
    if (body.customer_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("customers").select("*").eq("id", body.customer_id).eq("business_id", businessId).maybeSingle();
      customer = data ?? null;
    }

    const config = await resolveDocumentConfig(supabase, {
      businessId, docType,
      templateId: body.template_id ?? null,
      pdfSettings: business?.pdf_settings ?? null,
    });

    const d = body.doc ?? {};
    const lineItems = Array.isArray(d.line_items) ? d.line_items : [];
    const doc = {
      id: "preview",
      number: d.number || (docType === "quote" ? "QUO-PREVIEW" : "INV-PREVIEW"),
      status: d.status ?? "draft",
      customer_id: body.customer_id ?? null,
      issue_date: d.issue_date || new Date().toISOString().slice(0, 10),
      due_date: d.due_date || d.expiry_date || new Date().toISOString().slice(0, 10),
      expiry_date: d.expiry_date || new Date().toISOString().slice(0, 10),
      line_items: lineItems,
      subtotal: Number(d.subtotal) || 0,
      discount_type: d.discount_type ?? null,
      discount_value: Number(d.discount_value) || 0,
      discount_amount: Number(d.discount_amount) || 0,
      tax_total: Number(d.tax_total) || 0,
      total: Number(d.total) || 0,
      amount_paid: Number(d.amount_paid) || 0,
      notes: d.notes ?? null,
      terms: d.terms ?? null,
      property_address: d.property_address ?? null,
    };

    const { renderToStream, Font } = await import("@react-pdf/renderer");
    const React = await import("react");
    registerPdfFonts(Font);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let element: any;
    if (docType === "quote") {
      const { QuotePDFDocument } = await import("@/components/quotes/quote-pdf-document");
      element = React.createElement(QuotePDFDocument, { quote: doc as never, customer, business, lineItems, config });
    } else {
      const { InvoicePDFDocument } = await import("@/components/invoices/invoice-pdf-document");
      element = React.createElement(InvoicePDFDocument, { invoice: doc as never, customer, business, lineItems, config });
    }

    const stream = await renderToStream(element);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return new NextResponse(Buffer.concat(chunks), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=preview.pdf", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PDF/draft-preview]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
