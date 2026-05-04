/**
 * POST /api/v1/leads  — Create a lead from an external source (landing page, etc.)
 * GET  /api/v1/leads  — List leads (with optional ?status= filter)
 *
 * Auth: Per-business API key (Authorization: Bearer inv_xxx)
 * Scopes: leads:write (POST), leads:read (GET)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiKey, requireScope } from "@/lib/api-auth";
import { dispatchWebhook } from "@/lib/webhooks";

function err(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return err("Unauthorized", 401);
  if (!requireScope(ctx.scopes, "leads:write")) return err("Forbidden: missing leads:write scope", 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const { name, phone, email, suburb, service, property_type, timing,
    notes, source, utm_source, utm_medium, utm_campaign } = body as Record<string, string>;

  if (!name) return err("name is required", 400);

  // DB has a CHECK constraint on source. Coerce unknown values to 'landing-page'
  // and preserve the caller-supplied label in utm_source so tracking isn't lost.
  const ALLOWED_SOURCES = ["landing-page", "website", "referral", "telegram", "email", "phone", "manual"];
  const rawSource = (source || "landing-page").trim();
  const normalizedSource = ALLOWED_SOURCES.includes(rawSource) ? rawSource : "landing-page";
  const effectiveUtmSource = utm_source || (normalizedSource !== rawSource ? rawSource : null);

  const sb = createAdminClient();
  // Route through upsert_lead so external integrations (landing pages,
  // Zapier, scrapers) can post the same prospect repeatedly without
  // creating duplicates — sources/source_refs/last_seen_at are appended.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any).rpc("upsert_lead", {
    p_business_id:   ctx.businessId,
    p_user_id:       ctx.userId,
    p_name:          name,
    p_email:         email   || null,
    p_phone:         phone   || null,
    p_address:       null,
    p_suburb:        suburb  || null,
    p_service:       service || null,
    p_property_type: property_type || null,
    p_timing:        timing  || null,
    p_notes:         notes   || null,
    p_source:        normalizedSource,
    p_source_ref:    effectiveUtmSource ?? null,
  }).single();

  // Backfill UTM fields directly (they're not part of upsert_lead's surface).
  if (data && (effectiveUtmSource || utm_medium || utm_campaign)) {
    const patch: Record<string, string | null> = {};
    if (effectiveUtmSource) patch.utm_source   = effectiveUtmSource;
    if (utm_medium)         patch.utm_medium   = utm_medium;
    if (utm_campaign)       patch.utm_campaign = utm_campaign;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("leads").update(patch).eq("id", (data as { id: string }).id);
  }

  if (error) {
    console.error("Lead create error:", error);
    return err("Failed to create lead", 500);
  }

  dispatchWebhook(ctx.businessId, "lead.created", data);
  return NextResponse.json({ ok: true, lead: data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return err("Unauthorized", 401);
  if (!requireScope(ctx.scopes, "leads:read")) return err("Forbidden: missing leads:read scope", 403);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb as any)
    .from("leads")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return err("Failed to fetch leads", 500);

  return NextResponse.json({ leads: data, count: data?.length ?? 0 });
}
