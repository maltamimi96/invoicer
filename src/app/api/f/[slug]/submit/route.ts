import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAnswersForStorage, missingRequiredFields, invalidAnswerFields } from "@/lib/onboarding/answers";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/booking/public";
import type { OnboardingField, PublicFormSettings } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Public submit for a published form. No auth — slug-gated + spam-guarded. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { answers?: Record<string, any>; _hp?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  // Honeypot — bots fill the hidden field. Pretend success, do nothing.
  if (body._hp) return NextResponse.json({ ok: true });

  const ip = clientIp(req);
  if (!rateLimit(`form:${slug}:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many submissions — please wait a minute." }, { status: 429 });
  }

  const sb = createAdminClient();
  const { data: form } = await tbl(sb, "public_forms")
    .select("id, business_id, name, status, schema, settings").eq("slug", slug).maybeSingle();
  if (!form || form.status !== "published") return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const schema = (form.schema ?? []) as OnboardingField[];
  const settings = (form.settings ?? {}) as PublicFormSettings;
  const answers = body.answers ?? {};

  const missing = missingRequiredFields(schema, answers);
  const invalid = invalidAnswerFields(schema, answers);
  if (missing.length > 0 || invalid.length > 0) {
    return NextResponse.json({
      error: missing.length > 0 ? "Please fill in all required fields" : "Please fix the highlighted fields",
      missing, invalid,
    }, { status: 422 });
  }

  const stored = processAnswersForStorage(schema, answers); // no secure fields on public forms → passthrough
  const meta = {
    ip,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    referrer: req.headers.get("referer") ?? null,
  };

  // Optionally create a lead.
  let leadId: string | null = null;
  if (settings.create_lead ?? true) {
    const val = (fieldId?: string) => (fieldId ? String(answers[fieldId] ?? "").trim() : "");
    const firstOfType = (types: string[]) => schema.find((f) => types.includes(f.type))?.id;
    const nameFieldId  = settings.lead_map?.name  ?? schema.find((f) => /name/i.test(f.label) && ["short_text", "company"].includes(f.type))?.id;
    const emailFieldId = settings.lead_map?.email ?? firstOfType(["email"]);
    const phoneFieldId = settings.lead_map?.phone ?? firstOfType(["phone"]);
    const name  = val(nameFieldId);
    const email = val(emailFieldId);
    const phone = val(phoneFieldId);

    if (name || email || phone) {
      const { data: biz } = await tbl(sb, "businesses").select("user_id, name, slug, email").eq("id", form.business_id).single();
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created } = await (sb as any).rpc("upsert_lead", {
          p_business_id: form.business_id,
          p_user_id: biz?.user_id ?? null,
          p_name: name || email || phone || "Website enquiry",
          p_email: email || null,
          p_phone: phone || null,
          p_notes: `Submitted via form "${form.name}"`,
          p_source: "form",
          p_source_ref: slug,
        }).single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leadId = (created as any)?.id ?? null;
      } catch { /* lead creation best-effort — never block the submission */ }
    }
  }

  const { error } = await tbl(sb, "public_form_submissions").insert({
    business_id: form.business_id, form_id: form.id, answers: stored, lead_id: leadId, meta,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify (best-effort).
  const notify = settings.notify_emails ?? [];
  if (notify.length > 0) {
    try {
      const { data: biz } = await tbl(sb, "businesses").select("name, slug, email").eq("id", form.business_id).single();
      const rows = schema.filter((f) => !["heading", "divider", "instructions"].includes(f.type))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f) => `<tr><td style="padding:4px 10px;color:#666">${f.label}</td><td style="padding:4px 10px"><strong>${fmt((answers as any)[f.id])}</strong></td></tr>`).join("");
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:24px"><h1 style="font-size:18px;margin:0 0 12px">New submission: ${form.name}</h1><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>${leadId ? '<p style="font-size:12px;color:#2f6f73;margin-top:12px">✓ A lead was created in your pipeline.</p>' : ""}</div></body></html>`;
      await sendEmail({
        to: notify, subject: `New form submission — ${form.name}`, html,
        from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "forms" }),
        replyTo: biz?.email ?? undefined,
        tags: { business_id: form.business_id, doc_type: "custom", doc_id: form.id },
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, redirect_url: settings.redirect_url || null });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(v: any): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v.name) return `📎 ${v.name}`;
  if (v === true) return "Yes"; if (v === false) return "No";
  return String(v);
}
