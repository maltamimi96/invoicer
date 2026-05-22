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
import { fetchEmailsSince, type RawEmail, type ImapConfig } from "@/lib/email-reader";
import type { BusinessEmailConfig } from "@/types/database";

export const maxDuration = 300;

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
  // Action item — set when the email asks the OWNER to DO something
  // (send a quote, reply, fix an invoice, call someone, follow up, schedule).
  requires_action: boolean;
  action_title: string | null;        // short imperative, e.g. "Send quote to Sarah for gutter repair"
  action_priority: "low" | "normal" | "high" | "urgent" | null;
  action_due: "today" | "tomorrow" | "this_week" | null;
}

interface BusinessResult {
  businessId: string;
  businessName: string;
  processed: number;
  leads: number;
  tasks: number;
  skipped: number;
  duplicates: number;
  error?: string;
}

const DUE_OFFSET_DAYS: Record<string, number> = { today: 0, tomorrow: 1, this_week: 3 };

/** Create a to-do from an action-required email. Deduped by source_message_id
 *  via the partial unique index, so re-scans never duplicate it. Returns true
 *  if a new task was inserted. */
async function createTaskFromEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  createdBy: string,
  email: RawEmail,
  ex: LeadExtraction,
): Promise<boolean> {
  if (!ex.requires_action || !ex.action_title) return false;

  // Cheap pre-check (the unique index is the real guard against races).
  if (email.messageId) {
    const { data: existing } = await sb.from("tasks")
      .select("id").eq("business_id", businessId).eq("source_message_id", email.messageId).maybeSingle();
    if (existing) return false;
  }

  let dueDate: string | null = null;
  if (ex.action_due && ex.action_due in DUE_OFFSET_DAYS) {
    const d = new Date();
    d.setDate(d.getDate() + DUE_OFFSET_DAYS[ex.action_due]);
    dueDate = d.toISOString().split("T")[0];
  }

  const senderEmail = ex.email || email.from.match(/<(.+?)>/)?.[1] || email.from;
  const description =
    `From email: "${email.subject}"\n` +
    `Sender: ${senderEmail}\n` +
    (ex.notes ? `\n${ex.notes}` : "");

  // Next position in the todo column.
  const { data: maxRow } = await sb.from("tasks")
    .select("position").eq("business_id", businessId).eq("status", "todo")
    .order("position", { ascending: false }).limit(1).maybeSingle();

  const { error } = await sb.from("tasks").insert({
    business_id: businessId,
    created_by: createdBy,
    title: ex.action_title.slice(0, 300),
    description,
    status: "todo",
    priority: ex.action_priority ?? "normal",
    due_date: dueDate,
    tags: ["email", "auto"],
    position: (maxRow?.position ?? -1) + 1,
    source_message_id: email.messageId ?? null,
  });
  // Unique-violation (23505) => another run beat us to it; treat as no-op.
  if (error && error.code !== "23505") {
    console.error("[email-leads] task insert failed:", error.message);
    return false;
  }
  return !error;
}

// Daily scan covers the last ~26 hours (small overlap guards against boundary misses).
const SCAN_WINDOW_HOURS = 26;

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
  const prompt = `You are an email classifier for "${businessName}", a trades/services business that receives customer enquiries via email.

Read this email carefully and decide whether it is a GENUINE NEW LEAD — a real person with real work they may hire this business for.

A LEAD is:
- A direct enquiry from a real person (homeowner, tenant, builder, contractor, etc.) asking for a quote, booking, availability, repair, inspection, or advice
- A real estate agent, property manager, strata manager, or building manager reaching out about work on a property they manage
- A referral or introduction from another tradie/professional who is sending a real customer's details
- A follow-up from a previous prospect who hasn't booked yet
- An enquiry forwarded from this business's own website contact form or quote form
- Anything where a real human is describing real work to be done, even briefly

NOT a lead (set is_lead=false, this is important):
- **Lead-generation platform forwards: ServiceSeeking, hipages, Oneflare, Airtasker, Yellow Pages leads, Google Local Services leads, Facebook lead-ad forwards, Bark, TaskRabbit, Jim's, etc.** The business handles these on each platform directly — do NOT import them here. If the sender domain or subject is from a lead-gen platform, it is NOT a lead regardless of the customer content inside.
- SEO / digital-marketing / web-design / lead-generation sales pitches targeted AT this business ("we can rank you #1 on Google", "get more leads", "we build websites for tradies")
- Cold outreach from agencies, overseas developers, salespeople, or services trying to sell TO this business
- Generic spam, phishing, scams, crypto, "business opportunities", "partnership proposals"
- Marketing newsletters, promotional blasts, industry newsletters
- Transactional / automated mail with no customer intent: password resets, 2FA codes, subscription confirmations, payment receipts, supplier invoices, delivery notifications, calendar invites, system alerts, Stripe/PayPal/Xero emails
- Social media notifications (Facebook, Instagram, LinkedIn, Google Business, review-platform digests)
- Platform dashboards / stats / "your profile was viewed"
- Internal emails from the business's own staff or owner
- Automated replies, out-of-office, bounces, delivery failures

When unsure between "real human asking about work" and "sales pitch AT this business", read the content: if they're asking the business to DO work for them, it's a lead; if they're trying to sell the business something, it's NOT.

SEPARATELY, decide whether this email requires the BUSINESS OWNER to DO SOMETHING — an action/follow-up worth putting on their to-do list. Set requires_action=true and write a short imperative action_title for things like:
- "Send a quote to <name> for <work>"
- "Reply to <name> about <topic>"
- "Call <name> on <phone>"
- "Fix / re-send invoice <number>"
- "Follow up <name> on <topic>"
- "Schedule / book <job> for <name>"
- "Chase payment from <name>"
A genuine new lead almost always also needs an action (e.g. "Send quote to ..."). Set requires_action=false for purely informational mail, receipts, newsletters, spam, automated notifications, or anything that needs no human action.
Pick action_priority by urgency words ("urgent", "ASAP", "today", "by Friday") and money at stake. Pick action_due: "today" if they want a same-day response or it's urgent, "tomorrow" if soon, "this_week" otherwise, or null if no clear timeframe.

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
  "reason": "why you classified it this way (1 sentence)",
  "requires_action": true/false,
  "action_title": "short imperative task title or null",
  "action_priority": "low|normal|high|urgent or null",
  "action_due": "today|tomorrow|this_week or null"
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return { is_lead: false, name: null, phone: null, email: null, suburb: null, service: null, property_type: null, notes: null, reason: "No AI response", requires_action: false, action_title: null, action_priority: null, action_due: null };
    }

    let jsonStr = text.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(jsonStr) as LeadExtraction;
  } catch (e) {
    console.error("AI classification failed:", e);
    return { is_lead: false, name: null, phone: null, email: null, suburb: null, service: null, property_type: null, notes: null, reason: "AI error", requires_action: false, action_title: null, action_priority: null, action_due: null };
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
    tasks: 0,
    skipped: 0,
    duplicates: 0,
  };

  try {
    const imapConfig: ImapConfig = {
      host: config.imap_host,
      port: config.imap_port,
      user: config.imap_user,
      pass: config.imap_pass,
    };

    // Scan since the last successful check (with a 45-min overlap to guard
    // boundary misses), capped at SCAN_WINDOW_HOURS so a long outage doesn't
    // re-classify weeks of mail. Frequent runs therefore stay cheap.
    const lastChecked = config.last_checked ? new Date(config.last_checked).getTime() : 0;
    const overlapMs = 45 * 60 * 1000;
    const capMs = SCAN_WINDOW_HOURS * 60 * 60 * 1000;
    const sinceMs = lastChecked
      ? Math.max(lastChecked - overlapMs, Date.now() - capMs)
      : Date.now() - capMs;
    const since = new Date(sinceMs);
    const emails = await fetchEmailsSince(imapConfig, since, 200);
    result.processed = emails.length;

    if (emails.length === 0) return result;

    // Preload already-imported Message-IDs for this business so we skip them without paying for AI classification.
    const incomingIds = emails.map((e) => e.messageId).filter((m): m is string => !!m);
    const seenIds = new Set<string>();
    if (incomingIds.length) {
      const { data: existing } = await sb
        .from("leads")
        .select("source_message_id")
        .eq("business_id", config.business_id)
        .in("source_message_id", incomingIds);
      for (const row of (existing || []) as Array<{ source_message_id: string | null }>) {
        if (row.source_message_id) seenIds.add(row.source_message_id);
      }
    }

    for (const email of emails) {
      if (email.messageId && seenIds.has(email.messageId)) {
        result.duplicates++;
        continue;
      }

      const extraction = await classifyEmail(anthropic, email, config.business_name);

      // Action items first — a non-lead email (e.g. "re-send invoice INV-29",
      // "call the tenant back") can still need a to-do. Independent of lead.
      if (extraction.requires_action && extraction.action_title) {
        const made = await createTaskFromEmail(sb, config.business_id, config.business_user_id, email, extraction);
        if (made) {
          result.tasks++;
          await sendTelegram(
            `✅ <b>NEW TASK — Email</b> (${config.business_name})\n\n` +
            `📝 ${extraction.action_title}\n` +
            (extraction.action_due ? `⏰ ${extraction.action_due}\n` : "") +
            (extraction.action_priority ? `🔺 ${extraction.action_priority}\n` : "") +
            `\n✉️ ${email.subject}`
          );
        }
      }

      if (!extraction.is_lead) {
        result.skipped++;
        continue;
      }

      const senderEmail = extraction.email || email.from.match(/<(.+?)>/)?.[1] || null;

      // Route through upsert_lead so the same prospect arriving on a
      // different Message-ID (or also via Airtasker / Hipages / manual) gets
      // merged into the existing row — sources/source_refs/last_seen_at are
      // appended, never duplicated.
      const { data: upserted, error } = await sb.rpc("upsert_lead", {
        p_business_id:   config.business_id,
        p_user_id:       config.business_user_id,
        p_name:          extraction.name || email.from.replace(/<.*>/, "").trim() || "Unknown",
        p_email:         senderEmail,
        p_phone:         extraction.phone   || null,
        p_address:       null,
        p_suburb:        extraction.suburb  || null,
        p_service:       extraction.service || null,
        p_property_type: extraction.property_type || null,
        p_timing:        null,
        p_notes:         extraction.notes
          ? `[Email: ${email.subject}]\n${extraction.notes}`
          : `[Email: ${email.subject}]`,
        p_source:        "email",
        p_source_ref:    email.messageId ?? null,
      });

      if (error) {
        console.error(`Failed to create lead for ${config.business_name}:`, error);
        continue;
      }

      // Distinguish "new lead row" vs "merged into existing" so the digest is honest.
      // upsert_lead returns the row in both cases; we infer "merged" when sources
      // already contained 'email' from a prior run with the same Message-ID.
      const refs = (upserted as { source_refs?: Array<{ ref?: string | null }> } | null)?.source_refs ?? [];
      const isMergeOfSameEmail = email.messageId
        ? refs.filter((r) => r.ref === email.messageId).length > 1
        : false;

      if (isMergeOfSameEmail) {
        result.duplicates++;
        continue;
      }

      if (email.messageId) seenIds.add(email.messageId);
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

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.error = msg;
    console.error(`[email-leads] Error for ${config.business_name}:`, msg);
  } finally {
    const { error: updateErr } = await sb
      .from("business_email_config")
      .update({ last_checked: new Date().toISOString() })
      .eq("business_id", config.business_id);
    if (updateErr) {
      console.error(`[email-leads] Failed to update last_checked for ${config.business_name}:`, updateErr);
    }
  }

  return result;
}

/** Current wall-clock hour/minute in the business's local zone (Sydney). */
function localNow(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/** Cadence gate. The workflow fires every 30 min; we decide whether THIS tick
 *  should actually scan:
 *    - Daytime (6am–8pm Sydney): every run → twice an hour.
 *    - Night (8pm–6am): only on even hours at the top of the hour → once every
 *      two hours (8pm, 10pm, 12am, 2am, 4am).
 *  DST-proof because it reads the actual Sydney clock, not a fixed UTC offset. */
function shouldRunNow(): boolean {
  const { hour, minute } = localNow();
  const daytime = hour >= 6 && hour < 20;
  if (daytime) return true;
  return hour % 2 === 0 && minute < 30;
}

export async function GET(req: NextRequest) {
  // Auth
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[email-leads] CRON_SECRET is not configured");
    return new NextResponse("Server misconfigured", { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Cadence gate (skip unless ?force=1, used by manual workflow_dispatch).
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !shouldRunNow()) {
    const { hour, minute } = localNow();
    return NextResponse.json({ skipped: true, reason: "off-cadence", localTime: `${hour}:${String(minute).padStart(2, "0")}` });
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
    const totalTasks = results.reduce((s, r) => s + r.tasks, 0);
    const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
    console.log(`[email-leads] Scanned ${configs.length} business(es): ${totalProcessed} emails, ${totalLeads} leads, ${totalTasks} tasks`);

    return NextResponse.json({ businesses: configs.length, results });
  } catch (e) {
    console.error("email-leads cron error:", e);
    return NextResponse.json({ error: "Failed to process emails" }, { status: 500 });
  }
}
