/**
 * GET /api/cron/email-leads
 *
 * Reads unseen emails via IMAP, uses Claude AI to classify each as a lead or not,
 * and inserts genuine leads into the leads table.
 *
 * Triggered by GitHub Actions on a schedule:
 *   - Every 15 min during the day (7am–9pm AEST)
 *   - Every ~5 hours overnight
 *
 * Auth: CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUnseenEmails, type RawEmail } from "@/lib/email-reader";

export const maxDuration = 60;

const BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";
const OWNER_USER_ID = process.env.AGENT_USER_ID ?? "85e6a4dd-10b4-4ed9-a31c-b258ed784f2e";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

interface LeadExtraction {
  is_lead: boolean;
  name: string | null;
  phone: string | null;
  email: string | null;
  suburb: string | null;
  service: string | null;
  property_type: string | null;
  notes: string | null;
  reason: string;
}

async function sendTelegram(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch { /* non-fatal */ }
}

async function classifyEmail(
  anthropic: Anthropic,
  email: RawEmail
): Promise<LeadExtraction> {
  const prompt = `You are an email classifier for a roofing business (Crown Roofers, Sydney).

Analyze this email and determine if it's a genuine customer lead/enquiry.

A LEAD is: someone asking for a quote, booking a job, enquiring about roofing services, reporting a roof issue, etc.

NOT a lead: spam, newsletters, marketing, automated notifications, invoices from suppliers, replies to existing conversations, internal emails, social media alerts, Google/Facebook notifications, payment receipts, delivery notifications.

Email:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date.toISOString()}
Body:
${email.text}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "is_lead": true/false,
  "name": "extracted name or null",
  "phone": "extracted phone or null",
  "email": "sender's email address or null",
  "suburb": "extracted suburb/location or null",
  "service": "what service they need or null",
  "property_type": "residential/commercial or null",
  "notes": "brief summary of their request or null",
  "reason": "why you classified it this way (1 sentence)"
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return { is_lead: false, name: null, phone: null, email: null, suburb: null, service: null, property_type: null, notes: null, reason: "No AI response" };
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = text.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(jsonStr) as LeadExtraction;
  } catch (e) {
    console.error("AI classification failed:", e);
    return { is_lead: false, name: null, phone: null, email: null, suburb: null, service: null, property_type: null, notes: null, reason: "AI error" };
  }
}

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Check IMAP config
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    return NextResponse.json({ error: "IMAP not configured" }, { status: 503 });
  }

  try {
    // 1. Fetch unseen emails
    const emails = await fetchUnseenEmails(15);
    if (emails.length === 0) {
      return NextResponse.json({ processed: 0, leads: 0, skipped: 0, message: "No new emails" });
    }

    // 2. Classify each with AI
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const sb = createAdminClient();
    let leadsCreated = 0;
    let skipped = 0;

    for (const email of emails) {
      const result = await classifyEmail(anthropic, email);

      if (!result.is_lead) {
        skipped++;
        continue;
      }

      // Extract sender email from the "from" field if not extracted by AI
      const senderEmail = result.email || email.from.match(/<(.+?)>/)?.[1] || null;

      // 3. Insert lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any)
        .from("leads")
        .insert({
          name: result.name || email.from.replace(/<.*>/, "").trim() || "Unknown",
          phone: result.phone || null,
          email: senderEmail,
          suburb: result.suburb || null,
          service: result.service || null,
          property_type: result.property_type || null,
          notes: result.notes
            ? `[From email: ${email.subject}]\n${result.notes}`
            : `[From email: ${email.subject}]`,
          status: "new",
          source: "email" as const,
          business_id: BUSINESS_ID,
          user_id: OWNER_USER_ID,
        })
        .select("id, name, status")
        .single();

      if (error) {
        console.error("Failed to create lead from email:", error);
        continue;
      }

      leadsCreated++;

      // 4. Telegram notification
      await sendTelegram(
        `📧 <b>NEW LEAD — Email</b>\n\n` +
        `👤 <b>${result.name || "Unknown"}</b>\n` +
        (result.phone ? `📞 ${result.phone}\n` : "") +
        (senderEmail ? `📧 ${senderEmail}\n` : "") +
        (result.suburb ? `📍 ${result.suburb}\n` : "") +
        (result.service ? `🔧 ${result.service}\n` : "") +
        `\n📝 ${email.subject}`
      );
    }

    const summary = { processed: emails.length, leads: leadsCreated, skipped };
    console.log("[email-leads]", summary);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("email-leads cron error:", e);
    return NextResponse.json(
      { error: "Failed to process emails" },
      { status: 500 }
    );
  }
}
