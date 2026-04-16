/**
 * GET /api/cron/email-leads
 *
 * Loops through all businesses with email scanning enabled,
 * reads unseen emails via IMAP, classifies each with Claude AI,
 * and inserts genuine leads.
 *
 * Triggered by GitHub Actions on a schedule or manually.
 * Auth: CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUnseenEmails, type RawEmail, type ImapConfig } from "@/lib/email-reader";
import type { BusinessEmailConfig } from "@/types/database";

export const maxDuration = 60;

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

interface BusinessResult {
  businessId: string;
  businessName: string;
  processed: number;
  leads: number;
  skipped: number;
  error?: string;
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
  email: RawEmail,
  businessName: string
): Promise<LeadExtraction> {
  const prompt = `You are an email classifier for "${businessName}", a business that receives customer enquiries via email.

Analyze this email and determine if it's a genuine customer lead/enquiry.

A LEAD is: someone asking for a quote, booking a job, enquiring about services, reporting an issue, requesting information about pricing or availability.

NOT a lead: spam, newsletters, marketing, automated notifications, invoices from suppliers, replies to existing conversations, internal emails, social media alerts, Google/Facebook notifications, payment receipts, delivery notifications, password resets, subscription confirmations.

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

async function processBusinessEmails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  anthropic: Anthropic,
  config: BusinessEmailConfig & { business_name: string; business_user_id: string }
): Promise<BusinessResult> {
  const result: BusinessResult = {
    businessId: config.business_id,
    businessName: config.business_name,
    processed: 0,
    leads: 0,
    skipped: 0,
  };

  try {
    const imapConfig: ImapConfig = {
      host: config.imap_host,
      port: config.imap_port,
      user: config.imap_user,
      pass: config.imap_pass,
    };

    const emails = await fetchUnseenEmails(imapConfig, 15);
    result.processed = emails.length;

    if (emails.length === 0) return result;

    for (const email of emails) {
      const extraction = await classifyEmail(anthropic, email, config.business_name);

      if (!extraction.is_lead) {
        result.skipped++;
        continue;
      }

      const senderEmail = extraction.email || email.from.match(/<(.+?)>/)?.[1] || null;

      const { error } = await sb
        .from("leads")
        .insert({
          name: extraction.name || email.from.replace(/<.*>/, "").trim() || "Unknown",
          phone: extraction.phone || null,
          email: senderEmail,
          suburb: extraction.suburb || null,
          service: extraction.service || null,
          property_type: extraction.property_type || null,
          notes: extraction.notes
            ? `[Email: ${email.subject}]\n${extraction.notes}`
            : `[Email: ${email.subject}]`,
          status: "new",
          source: "email",
          business_id: config.business_id,
          user_id: config.business_user_id,
        });

      if (error) {
        console.error(`Failed to create lead for ${config.business_name}:`, error);
        continue;
      }

      result.leads++;

      await sendTelegram(
        `📧 <b>NEW LEAD — Email</b> (${config.business_name})\n\n` +
        `👤 <b>${extraction.name || "Unknown"}</b>\n` +
        (extraction.phone ? `📞 ${extraction.phone}\n` : "") +
        (senderEmail ? `📧 ${senderEmail}\n` : "") +
        (extraction.suburb ? `📍 ${extraction.suburb}\n` : "") +
        (extraction.service ? `🔧 ${extraction.service}\n` : "") +
        `\n📝 ${email.subject}`
      );
    }

    // Update last_checked
    await sb
      .from("business_email_config")
      .update({ last_checked: new Date().toISOString() })
      .eq("business_id", config.business_id);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    console.error(`[email-leads] Error for ${config.business_name}:`, msg);
  }

  return result;
}

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const sb = createAdminClient();

    // Fetch all enabled email configs with business info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: configs, error: configError } = await (sb as any)
      .from("business_email_config")
      .select("*, businesses(name, user_id)")
      .eq("enabled", true);

    if (configError) {
      console.error("Failed to fetch email configs:", configError);
      return NextResponse.json({ error: "Failed to load configs" }, { status: 500 });
    }

    if (!configs?.length) {
      return NextResponse.json({ message: "No businesses with email scanning enabled", results: [] });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const results: BusinessResult[] = [];

    for (const config of configs) {
      const enriched = {
        ...config,
        business_name: config.businesses?.name || "Unknown",
        business_user_id: config.businesses?.user_id || "",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await processBusinessEmails(sb as any, anthropic, enriched);
      results.push(result);
    }

    const totalLeads = results.reduce((s, r) => s + r.leads, 0);
    const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
    console.log(`[email-leads] Scanned ${configs.length} business(es): ${totalProcessed} emails, ${totalLeads} leads`);

    return NextResponse.json({ businesses: configs.length, results });
  } catch (e) {
    console.error("email-leads cron error:", e);
    return NextResponse.json({ error: "Failed to process emails" }, { status: 500 });
  }
}
