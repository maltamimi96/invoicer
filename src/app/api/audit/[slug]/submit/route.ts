import { NextRequest, NextResponse } from "next/server";
import { emitAutomationEvent } from "@/lib/automations/emit";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/booking/public";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

function normUrl(input: string): string | null {
  let u = input.trim().toLowerCase();
  if (!u) return null;
  if (!/^https?:\/\//.test(u)) u = "https://" + u;
  try { const parsed = new URL(u); return parsed.hostname ? parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname) : null; }
  catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: { url?: string; email?: string; name?: string; _hp?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  if (body._hp) return NextResponse.json({ ok: true }); // honeypot — silently accept

  const ip = clientIp(req);
  if (!rateLimit(`audit:${slug}:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests — try again in a minute." }, { status: 429 });
  }

  const url = normUrl(body.url ?? "");
  const email = (body.email ?? "").trim() || null;
  if (!url) return NextResponse.json({ error: "Enter a valid website URL." }, { status: 422 });
  if (!email) return NextResponse.json({ error: "Enter your email." }, { status: 422 });

  const sb = createAdminClient();
  const { data: business } = await tbl(sb, "businesses").select("id, user_id").eq("audit_slug", slug).maybeSingle();
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const name = (body.name ?? "").trim() || null;
  const viewToken = "aud_" + randomBytes(20).toString("hex");

  // Create the queued audit.
  const { data: audit, error: auditErr } = await tbl(sb, "seo_audits").insert({
    business_id: business.id, url, email, name, status: "queued", view_token: viewToken,
  }).select("id").single();
  if (auditErr) return NextResponse.json({ error: "Could not queue the audit." }, { status: 500 });

  // Create/dedup the lead (source seo-audit).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb as any).rpc("upsert_lead", {
    p_business_id: business.id,
    p_user_id: business.user_id,
    p_name: name || email,
    p_email: email,
    p_phone: null,
    p_address: null, p_suburb: null, p_service: null,
    p_property_type: null, p_timing: null,
    p_notes: `Requested a free SEO audit for ${url}`,
    p_source: "seo-audit",
    p_source_ref: slug,
  }).single();
  if (lead?.id) await tbl(sb, "seo_audits").update({ lead_id: lead.id }).eq("id", audit.id);
  // Another upsert_lead caller that bypasses createLead(): without this an
  // audit request never triggers a lead automation.
  if (lead?.id) await emitAutomationEvent(sb, business.id, "lead.created", "lead", lead.id);

  return NextResponse.json({ ok: true });
}
