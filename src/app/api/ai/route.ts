import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.type === "cleanup_text") {
      if (!body.text?.trim()) {
        return NextResponse.json({ error: "No text provided" }, { status: 400 });
      }

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a professional business writing assistant for a trades/construction business. Clean up and improve the following scope of works or notes for a quote. Make it clear, professional, and well-structured. Keep all the same information but improve the wording and grammar. Use plain text only — no markdown, no asterisks, no hashes. Use a dash (-) for bullet points if needed. Return only the cleaned up text, nothing else.\n\n${body.text}`,
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return NextResponse.json({ result: text });
    }

    if (body.type === "describe_images") {
      if (!body.images?.length) {
        return NextResponse.json({ error: "No images provided" }, { status: 400 });
      }

      const imageContent = body.images.map(
        (img: { base64: string; mediaType: string }) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.base64,
          },
        })
      );

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              ...imageContent,
              {
                type: "text",
                text: "You are a professional trades/construction estimator assistant. Analyze these site images and generate a clear, professional scope of works description suitable for a quote or job order. Include what work needs to be done based on what you can see, materials that may be required, and any notable observations. Be specific and professional. Use plain text only — no markdown, no asterisks, no hashes. Use a dash (-) for bullet points. Return only the scope description, nothing else.",
              },
            ],
          },
        ],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return NextResponse.json({ result: text });
    }

    if (body.type === "generate_report") {
      const { description, imageUrls, meta } = body as {
        description: string;
        imageUrls: string[];
        meta: { property_address: string; inspection_date: string; roof_type: string; inspector_name: string };
      };

      const imageContent = (imageUrls ?? []).map((url: string) => ({
        type: "image" as const,
        source: { type: "url" as const, url },
      }));

      const photoCount = imageUrls?.length ?? 0;
      const promptText = `You are writing a professional roof inspection report.

Property address: ${meta.property_address}
Inspection date: ${meta.inspection_date}
Roof type: ${meta.roof_type}
Inspector: ${meta.inspector_name}

Inspector's notes:
${description || "No additional notes provided."}

${photoCount > 0 ? `The ${photoCount} images above are numbered 1 through ${photoCount} in order.` : "No site photos were provided."}

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences):
{
  "sections": {
    "executive_summary": "2-3 paragraph professional summary of overall condition and findings",
    "tile_condition": "detailed findings paragraph with severity assessment",
    "biological_contamination": "findings paragraph",
    "ridge_hip_capping": "findings paragraph",
    "valleys_flashings": "findings paragraph",
    "solar_panel_mounting": "findings paragraph",
    "structural_assessment": "overall structural integrity assessment paragraph"
  },
  "meta": {
    "advisory_banner": "single-sentence advisory warning for the cover page",
    "roof_features": "comma-separated list of roof features observed",
    "inspection_method": "description of inspection methodology used",
    "risk_items": [
      { "defect": "defect name", "likelihood": "Certain|High|Medium|Low", "consequence": "Active water ingress|etc", "rating": "Critical|High|Medium|Low" }
    ],
    "scope_of_works": ["numbered action item 1", "numbered action item 2"],
    "urgency": "urgency paragraph explaining timeline for works"
  },
  "photo_captions": ["Descriptive caption for photo 1", "caption for photo 2"]
}

Rules:
- All content must be plain text. No asterisks, no markdown, no bullet characters — use plain sentences.
- risk_items: identify 5-8 distinct defects. rating must be exactly one of: Low, Medium, High, Critical.
- scope_of_works: 6-10 specific action items for replacement/repair works.
- photo_captions: provide exactly ${photoCount} captions describing what roofing defect or feature is visible in each image. If no photos, return an empty array.`;

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: "You are an expert roofing inspector writing a formal professional inspection report. Write in authoritative, precise language. Return ONLY valid JSON — no commentary, no code fences.",
        messages: [
          {
            role: "user",
            content: photoCount > 0
              ? [...imageContent, { type: "text" as const, text: promptText }]
              : [{ type: "text" as const, text: promptText }],
          },
        ],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const cleaned = raw.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();

      // Defensively extract JSON object
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid JSON structure");

      const result = JSON.parse(match[0]);

      // Ensure photo_captions matches image count
      if (!Array.isArray(result.photo_captions)) result.photo_captions = [];
      while (result.photo_captions.length < photoCount) result.photo_captions.push("");

      // Validate risk ratings
      const validRatings = new Set(["Low", "Medium", "High", "Critical"]);
      if (Array.isArray(result.meta?.risk_items)) {
        result.meta.risk_items = result.meta.risk_items.map((item: { rating?: string; [key: string]: unknown }) => ({
          ...item,
          rating: validRatings.has(item.rating ?? "") ? item.rating : "Medium",
        }));
      }

      return NextResponse.json({ result });
    }

    if (body.type === "analyze_work_order") {
      const { imageUrls, workerNotes, title, propertyAddress } = body as {
        imageUrls: string[];
        workerNotes?: string;
        title: string;
        propertyAddress?: string;
      };

      const imageContent = (imageUrls ?? []).map((url: string) => ({
        type: "image" as const,
        source: { type: "url" as const, url },
      }));

      const photoCount = imageUrls?.length ?? 0;
      const promptText = `You are a professional trades/construction estimator.

Job: ${title}${propertyAddress ? `\nLocation: ${propertyAddress}` : ""}${workerNotes ? `\n\nWorker's site notes:\n${workerNotes}` : ""}
${photoCount > 0 ? `\nThe ${photoCount} site photo${photoCount > 1 ? "s" : ""} above show the current condition of the work area.` : ""}

Based on the${photoCount > 0 ? " photos and" : ""} notes above, write a clear and professional scope of work for this job.

Include:
- What work needs to be done (specific tasks)
- Materials or equipment likely required
- Any relevant observations from the site
- Recommended sequencing if multiple tasks

Use plain text only. Use a dash (-) for bullet points. No markdown, no asterisks. Return only the scope of work text, nothing else.`;

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: photoCount > 0
            ? [...imageContent, { type: "text" as const, text: promptText }]
            : [{ type: "text" as const, text: promptText }],
        }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      return NextResponse.json({ result: text });
    }

    if (body.type === "smart_fill_document") {
      const { text, mode, customers, defaultTaxRate, today } = body as {
        text: string;
        mode: "invoice" | "quote";
        customers: Array<{ id: string; name: string; company?: string | null; email?: string | null }>;
        defaultTaxRate: number;
        today: string;
      };

      if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

      const customerList = customers.length
        ? `Existing customers (match by name/email/company if possible):\n${customers.map((c) => `- id:${c.id} | ${c.name}${c.company ? ` (${c.company})` : ""}${c.email ? ` <${c.email}>` : ""}`).join("\n")}`
        : "No existing customers.";

      const dueDateField = mode === "invoice" ? "due_date" : "expiry_date";

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: "You are a precise data extraction assistant for a trades/construction invoicing app. Return ONLY valid JSON — no commentary, no code fences.",
        messages: [{
          role: "user",
          content: `Extract all details from the pasted text to fill a ${mode} form. Today is ${today}.

${customerList}

Return a single JSON object with this exact structure:
{
  "existing_customer_id": "id from the list above if confident match, otherwise null",
  "new_customer": {
    "name": "full name (required if no existing_customer_id)",
    "company": "company name or null",
    "email": "email or null",
    "phone": "phone or null",
    "address": "street address or null",
    "city": "city or null",
    "postcode": "postcode or null",
    "country": "country or null"
  },
  "issue_date": "YYYY-MM-DD or null",
  "${dueDateField}": "YYYY-MM-DD or null",
  "line_items": [
    {
      "name": "item name",
      "description": "detail or empty string",
      "quantity": 1,
      "unit_price": 0.00,
      "tax_rate": ${defaultTaxRate}
    }
  ],
  "notes": "scope of works, job notes, or empty string",
  "terms": "payment terms or empty string",
  "discount_type": "percent" or "fixed" or null,
  "discount_value": 0
}

Rules:
- If existing_customer_id is set, set new_customer to null.
- If no customer match, populate new_customer with whatever info is available (at minimum name).
- Dates: if relative ("in 30 days", "end of month") calculate from today (${today}).
- If prices include GST/tax, back-calculate to get ex-tax unit_price.
- Strip currency symbols. If "Included" or no price, use 0.
- default tax_rate is ${defaultTaxRate} unless specified.
- Return ONLY the JSON object.

Text:
${text}`,
        }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
      const cleaned = raw.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("AI returned invalid structure");
      return NextResponse.json({ result: JSON.parse(match[0]) });
    }

    if (body.type === "parse_line_items") {
      const { text, defaultTaxRate } = body as { text: string; defaultTaxRate?: number };
      if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: "You are a precise data extraction assistant. Return ONLY valid JSON — no commentary, no code fences, no markdown.",
        messages: [{
          role: "user",
          content: `Extract line items from the following text and return them as a JSON array.

Each item must have:
- "name": string (short item/service name, required)
- "description": string (extra detail, can be empty string)
- "quantity": number (default 1 if not specified)
- "unit_price": number (price per unit excluding tax, 0 if not specified)
- "tax_rate": number (percentage, use ${defaultTaxRate ?? 10} if not specified or if GST/tax is mentioned without a rate)

Rules:
- If the text contains a table (markdown, CSV, TSV, or plain columns), parse each row as an item.
- If it's a list of services, each service becomes an item.
- If prices include GST/tax, back-calculate to get the ex-tax unit_price.
- Strip currency symbols from prices.
- If a row says "Included" or "$0" for price, set unit_price to 0.
- Return ONLY the JSON array, no wrapper object.

Text to parse:
${text}`,
        }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "[]";
      const cleaned = raw.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) return NextResponse.json({ result: [] });

      const items = JSON.parse(match[0]);
      return NextResponse.json({ result: items });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("[AI route error]", error);
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
