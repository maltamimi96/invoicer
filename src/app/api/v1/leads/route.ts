/**
 * POST /api/v1/leads  — Create a lead from an external source (landing page, etc.)
 * GET  /api/v1/leads  — List leads (with optional ?status= filter)
 *
 * Auth: X-API-Key header
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || !key) return false;
  if (key.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < key.length; i++) {
    mismatch |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function err(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status });
}

async function getBizContext(sb: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb as any)
    .from("businesses")
    .select("id, user_id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  return data;
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) return err("Unauthorized", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const { name, phone, email, suburb, service, property_type, timing,
    notes, source, utm_source, utm_medium, utm_campaign } = body as Record<string, string>;

  if (!name) return err("name is required", 400);

  const sb = createAdminClient();
  const biz = await getBizContext(sb);
  if (!biz) return err("Service unavailable", 503);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("leads")
    .insert({
      name,
      phone: phone || null,
      email: email || null,
      suburb: suburb || null,
      service: service || null,
      property_type: property_type || null,
      timing: timing || null,
      notes: notes || null,
      status: "new",
      source: source || "landing-page",
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      business_id: biz.id,
      user_id: biz.user_id,
    })
    .select("id, name, status")
    .single();

  if (error) {
    console.error("Lead create error:", error);
    return err("Failed to create lead", 500);
  }

  return NextResponse.json({ ok: true, lead: data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) return err("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");

  const sb = createAdminClient();
  const biz = await getBizContext(sb);
  if (!biz) return err("Service unavailable", 503);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb as any)
    .from("leads")
    .select("*")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return err("Failed to fetch leads", 500);

  return NextResponse.json({ leads: data, count: data?.length ?? 0 });
}
