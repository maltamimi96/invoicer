import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/actions/reports";
import { getBusiness } from "@/lib/actions/business";
import { ROOF_INSPECTION_SECTIONS } from "@/lib/templates/roof-inspection";
import type { RiskItem } from "@/types/database";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [report, business] = await Promise.all([getReport(id), getBusiness()]);
    const m = report.meta;
    const sectionMap = Object.fromEntries(report.sections.map((s) => [s.id, s.content]));

    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
      ImageRun, PageBreak,
    } = await import("docx");

    // Helper builders
    const h1 = (text: string) =>
      new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } });

    const h2 = (text: string) =>
      new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });

    const body = (text: string) =>
      new Paragraph({ text: text || "—", spacing: { after: 120 }, style: "Normal" });

    const keyValueTable = (rows: [string, string][]) =>
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
        },
        rows: rows.map(([key, val]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: key, bold: true, size: 18 })] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: val || "—", size: 18 })] })],
              }),
            ],
          })
        ),
      });

    const ratingColor = (r: string) => {
      if (r === "Critical") return "DC2626";
      if (r === "High") return "EA580C";
      if (r === "Medium") return "CA8A04";
      return "16A34A";
    };

    // Fetch images as buffers (with timeout)
    const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      } catch {
        return null;
      }
    };

    // Fetch all images (batch of 5)
    const imageBufs: (Buffer | null)[] = [];
    const batchSize = 5;
    for (let i = 0; i < report.photos.length; i += batchSize) {
      const batch = report.photos.slice(i, i + batchSize);
      const bufs = await Promise.all(batch.map((p) => fetchImageBuffer(p.url)));
      imageBufs.push(...bufs);
    }

    // Build document children
    const children = [
      // ── Cover
      new Paragraph({
        children: [new TextRun({ text: business.name, bold: true, size: 52, color: "1E293B" })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "ROOF INSPECTION REPORT", bold: true, size: 36, color: "374151" })],
        spacing: { after: 320 },
      }),
      keyValueTable([
        ["Property Address", report.property_address ?? ""],
        ["Inspection Date", report.inspection_date ?? ""],
        ["Report Date", report.report_date],
        ["Roof Type", m.roof_type],
        ["Inspector", m.inspector_name],
        ["Status", report.status === "complete" ? "FINAL" : "DRAFT"],
      ]),
      ...(m.advisory_banner ? [
        new Paragraph({ spacing: { before: 320 } }),
        new Paragraph({
          children: [new TextRun({ text: `ADVISORY: ${m.advisory_banner}`, bold: true, color: "92400E", size: 18 })],
          shading: { fill: "FEF3C7", type: ShadingType.CLEAR },
          border: { left: { style: BorderStyle.THICK, size: 6, color: "F59E0B" } },
          spacing: { before: 160, after: 160 },
          indent: { left: 200 },
        }),
      ] : []),

      // Page break after cover
      new Paragraph({ children: [new PageBreak()] }),

      // ── Executive Summary
      h1("1. Executive Summary"),
      body(sectionMap["executive_summary"]),

      // ── Property & Scope
      h1("2. Property & Scope of Inspection"),
      keyValueTable([
        ["Property Address", report.property_address ?? ""],
        ["Roof Type", m.roof_type],
        ["Roof Features", m.roof_features],
        ["Inspection Method", m.inspection_method],
        ["Inspector", m.inspector_name],
        ["Inspection Date", report.inspection_date ?? ""],
      ]),

      new Paragraph({ children: [new PageBreak()] }),

      // ── Detailed Findings
      h1("3. Detailed Inspection Findings"),
      ...ROOF_INSPECTION_SECTIONS.slice(1).flatMap((tmpl) => [
        h2(`${tmpl.numbering} ${tmpl.title}`),
        body(sectionMap[tmpl.id]),
      ]),

      new Paragraph({ children: [new PageBreak()] }),

      // ── Risk Assessment
      h1("4. Risk Assessment"),
      ...(m.risk_items?.length > 0 ? [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Defect", "Likelihood", "Consequence", "Risk Rating"].map((h) =>
                new TableCell({
                  shading: { fill: "1E293B", type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })],
                })
              ),
            }),
            ...m.risk_items.map((item: RiskItem, i: number) =>
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8FAFC", type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: item.defect, size: 18 })] })],
                  }),
                  new TableCell({
                    shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8FAFC", type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: item.likelihood, size: 18 })] })],
                  }),
                  new TableCell({
                    shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8FAFC", type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: item.consequence, size: 18 })] })],
                  }),
                  new TableCell({
                    shading: { fill: i % 2 === 0 ? "FFFFFF" : "F8FAFC", type: ShadingType.CLEAR },
                    children: [new Paragraph({ children: [new TextRun({ text: item.rating, bold: true, color: ratingColor(item.rating), size: 18 })] })],
                  }),
                ],
              })
            ),
          ],
        }),
      ] : [body("No risk items recorded.")]),

      // ── Recommendation
      h1("5. Recommendation"),
      h2("5.1 Recommended Scope of Works"),
      ...(m.scope_of_works?.map((item, i) =>
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${item}`, size: 20 })],
          spacing: { after: 100 },
        })
      ) ?? [body("No scope of works recorded.")]),

      h2("5.2 Urgency"),
      body(m.urgency),

      // ── Photographic Record
      ...(report.photos.length > 0 ? [
        new Paragraph({ children: [new PageBreak()] }),
        h1("6. Photographic Record"),
        body(`The following ${report.photos.length} photograph${report.photos.length !== 1 ? "s" : ""} were captured on-site at ${report.property_address} on ${report.inspection_date}.`),
        ...report.photos.flatMap((photo, i) => {
          const buf = imageBufs[i];
          const rows = [];
          if (buf) {
            rows.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: buf,
                    transformation: { width: 400, height: 300 },
                    type: "jpg",
                  }),
                ],
                spacing: { before: 200, after: 80 },
                alignment: AlignmentType.LEFT,
              })
            );
          }
          rows.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Photo ${photo.order}: `, bold: true, size: 18 }),
                new TextRun({ text: photo.caption || "Site photograph", size: 18, color: "6B7280" }),
              ],
              spacing: { after: 200 },
            })
          );
          return rows;
        }),
      ] : []),
    ];

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri", size: 22 } },
        },
      },
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = report.title.replace(/[^a-z0-9]/gi, "_") + ".docx";

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Report DOCX]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
