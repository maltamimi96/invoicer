/**
 * POST /api/report-sessions/generate
 *
 * 1. Receives a report session ID + Telegram bot token
 * 2. Downloads all photos from Telegram
 * 3. Sends them to Claude claude-opus-4-6 for analysis
 * 4. Generates a branded PDF with @react-pdf/renderer
 * 5. Uploads PDF to Supabase storage
 * 6. Returns a public URL
 *
 * This endpoint can take up to 2 minutes — configured via maxDuration.
 */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoofInspectionReportData } from "@/components/reports/roof-inspection-pdf";

const AGENT_BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";

function checkKey(req: NextRequest) {
  const key = req.headers.get("x-api-key");
  return key === process.env.INTERNAL_API_KEY;
}

async function downloadTelegramPhoto(botToken: string, fileId: string): Promise<Buffer | null> {
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;
    const filePath = fileData.result.file_path;
    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!imgRes.ok) return null;
    const arrayBuffer = await imgRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function toBase64DataUrl(buf: Buffer, mimeType = "image/jpeg"): string {
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    session_id: string;
    bot_token: string;
    property_address?: string;
  };

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => (sb as any).from(name);

  // Load session
  const { data: session, error: sessErr } = await tbl("report_sessions")
    .select("*")
    .eq("id", body.session_id)
    .single();
  if (sessErr || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const address = body.property_address || session.property_address || "Unknown address";
  const fileIds: string[] = session.photo_file_ids ?? [];
  if (fileIds.length === 0) return NextResponse.json({ error: "No photos in session" }, { status: 400 });

  // Mark generating
  await tbl("report_sessions").update({ status: "generating" }).eq("id", session.id);

  try {
    // ── Download photos ──────────────────────────────────────────────────────
    const photoBuffers: Buffer[] = [];
    for (const fid of fileIds) {
      const buf = await downloadTelegramPhoto(body.bot_token, fid);
      if (buf) photoBuffers.push(buf);
    }
    if (photoBuffers.length === 0) throw new Error("Failed to download any photos");

    // ── Claude vision analysis ───────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const imageContent: Anthropic.ImageBlockParam[] = photoBuffers.map((buf) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: buf.toString("base64"),
      },
    }));

    const prompt = `You are an expert roofing inspector for Crown Roofers, a professional roofing company in Sydney, Australia.

Analyse these ${photoBuffers.length} roof inspection photos and produce a structured JSON report.

Respond with ONLY valid JSON in this exact format:
{
  "executiveSummary": "2-3 sentence overall condition assessment",
  "scope": "1-2 sentences describing what was inspected",
  "photos": [
    { "caption": "Photo 1 description — what is shown, condition observed" },
    ... (one entry per photo, in order)
  ],
  "sections": [
    {
      "heading": "Category name e.g. Tile Condition, Gutters, Valley Flashings, Hip Capping, Downpipes, Fascia & Eaves",
      "severity": "CRITICAL" | "SIGNIFICANT" | "MINOR" | "ADVISORY",
      "bullets": ["Finding 1", "Finding 2", ...]
    }
    ... (only include categories you can actually see evidence of)
  ],
  "recommendations": [
    "Action item 1",
    "Action item 2",
    ...
  ],
  "paintingNote": "Brief note on whether painting is recommended (Crown Roofers generally recommends high-pressure clean + chemical treatment over painting for terracotta tiles)"
}

Rules:
- Captions should be professional and specific: describe what you see, the condition, and why it matters
- Findings should be actionable and specific
- Only report on what you can actually see in the photos
- Use Australian roofing terminology
- Be thorough but concise`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response (Claude sometimes wraps it in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude did not return valid JSON");
    const analysis = JSON.parse(jsonMatch[0]) as {
      executiveSummary: string;
      scope: string;
      photos: Array<{ caption: string }>;
      sections: Array<{ heading: string; severity: string; bullets: string[] }>;
      recommendations: string[];
      paintingNote: string;
    };

    // ── Build report data ────────────────────────────────────────────────────
    const today = new Date();
    const inspectionDate = today.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const slug = address.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase();
    const refNum = `CRR-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-${slug}`;

    // Fetch Crown Roofers logo as base64
    let logoBase64: string | undefined;
    try {
      const { data: bizData } = await tbl("businesses").select("logo_url").eq("id", AGENT_BUSINESS_ID).single();
      if (bizData?.logo_url) {
        const logoRes = await fetch(bizData.logo_url);
        if (logoRes.ok) {
          const logoBuf = await logoRes.arrayBuffer();
          const ext = bizData.logo_url.includes(".png") ? "image/png" : "image/jpeg";
          logoBase64 = `data:${ext};base64,${Buffer.from(logoBuf).toString("base64")}`;
        }
      }
    } catch { /* logo is optional */ }

    const reportData: RoofInspectionReportData = {
      propertyAddress: address,
      inspectionDate,
      referenceNumber: refNum,
      executiveSummary: analysis.executiveSummary,
      scope: analysis.scope,
      sections: analysis.sections as RoofInspectionReportData["sections"],
      recommendations: analysis.recommendations,
      paintingNote: analysis.paintingNote,
      photos: photoBuffers.map((buf, i) => ({
        caption: analysis.photos[i]?.caption ?? `Photo ${i + 1}`,
        dataUrl: toBase64DataUrl(buf),
      })),
    };

    // ── Render PDF ───────────────────────────────────────────────────────────
    const React = (await import("react")).default;
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { RoofInspectionPDF } = await import("@/components/reports/roof-inspection-pdf");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(RoofInspectionPDF, { data: reportData, logoBase64 }) as any;
    const pdfBuffer = await renderToBuffer(element);

    // ── Upload to Supabase storage ───────────────────────────────────────────
    const fileName = `${refNum}_${slug}.pdf`;
    const { error: uploadErr } = await sb.storage
      .from("roof-reports")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: urlData } = sb.storage.from("roof-reports").getPublicUrl(fileName);
    const reportUrl = urlData.publicUrl;

    // Mark done
    await tbl("report_sessions").update({ status: "done", report_url: reportUrl }).eq("id", session.id);

    return NextResponse.json({
      url: reportUrl,
      filename: `Roof_Inspection_Report_${slug}.pdf`,
      photoCount: photoBuffers.length,
      sections: analysis.sections.length,
    });
  } catch (err) {
    await tbl("report_sessions").update({ status: "failed" }).eq("id", session.id);
    console.error("Report generation error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}
