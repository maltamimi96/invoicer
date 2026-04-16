/**
 * POST /api/v1/customers  — Create a customer from an external source
 * GET  /api/v1/customers  — List customers
 *
 * Auth: Per-business API key (Authorization: Bearer inv_xxx)
 * Scopes: customers:write (POST), customers:read (GET)
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
  if (!requireScope(ctx.scopes, "customers:write")) return err("Forbidden: missing customers:write scope", 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }

  const { name, email, phone, company, address, city, postcode, country, tax_number, notes } =
    body as Record<string, string>;

  if (!name) return err("name is required", 400);

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("customers")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      address: address || null,
      city: city || null,
      postcode: postcode || null,
      country: country || null,
      tax_number: tax_number || null,
      notes: notes || null,
      archived: false,
      business_id: ctx.businessId,
      user_id: ctx.userId,
    })
    .select("id, name, email, company")
    .single();

  if (error) {
    console.error("Customer create error:", error);
    return err("Failed to create customer", 500);
  }

  dispatchWebhook(ctx.businessId, "customer.created", data);
  return NextResponse.json({ ok: true, customer: data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) return err("Unauthorized", 401);
  if (!requireScope(ctx.scopes, "customers:read")) return err("Forbidden: missing customers:read scope", 403);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "50");

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb as any)
    .from("customers")
    .select("id, name, email, phone, company, address, city, postcode, country")
    .eq("business_id", ctx.businessId)
    .eq("archived", false)
    .order("name")
    .limit(limit);

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return err("Failed to fetch customers", 500);

  return NextResponse.json({ customers: data, count: data?.length ?? 0 });
}
