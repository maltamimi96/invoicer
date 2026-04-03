import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/actions/reports";
import { getBusiness } from "@/lib/actions/business";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [reportData, business] = await Promise.all([getReport(id), getBusiness()]);

    const { renderToStream } = await import("@react-pdf/renderer");
    const { ReportPdfDocument } = await import("@/components/reports/report-pdf-document");
    const React = await import("react");

    const element = React.createElement(ReportPdfDocument, {
      report: reportData,
      business,
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
