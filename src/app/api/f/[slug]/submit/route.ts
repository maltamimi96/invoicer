import { NextResponse, type NextRequest } from "next/server";
import { emitAutomationEvent } from "@/lib/automations/emit";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAnswersForStorage, missingRequiredFields, invalidAnswerFields } from "@/lib/onboarding/answers";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { esc } from "@/lib/outreach/render";
import { rateLimit, clientIp } from "@/lib/booking/public";
import { resolveInvite } from "@/lib/forms/invite";
import type { OnboardingField, PublicFormSettings } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Public submit for a published form. No auth — slug-gated + spam-guarded. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { answers?: Record<string, any>; _hp?: string; invite?: string };
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

  // Was this sent to someone we already have? If so the submission belongs to
  // THEM — creating a lead here would mint a second record of a person already
  // in the pipeline, which is the whole reason invites exist.
  //
  // An unusable token (expired, wrong form) resolves to null and the
  // submission proceeds as ordinary public traffic. Someone answering a form
  // they were sent should never hit an error because the link aged out; their
  // answers land either way, just unattached.
  const invite = await resolveInvite(sb, form.id, body.invite);

  let leadId: string | null = invite?.lead_id ?? null;
  if (!invite && (settings.create_lead ?? true)) {
    const val = (fieldId?: string) => (fieldId ? String(answers[fieldId] ?? "").trim() : "");
    const firstOfType = (types: string[]) => schema.find((f) => types.includes(f.type))?.id;
    const nameFieldId  = settings.lead_map?.name  ?? schema.find((f) => /name/i.test(f.label) && ["short_text", "company"].includes(f.type))?.id;
    const emailFieldId = settings.lead_map?.email ?? firstOfType(["email"]);
    const phoneFieldId = settings.lead_map?.phone ?? firstOfType(["phone"]);
    const name  = val(nameFieldId);
    const email = val(emailFieldId);
    const phone = val(phoneFieldId);

    if (name || email || phone) {
      const { data: biz } = await tbl(sb, "businesses").select("user_id, name, email").eq("id", form.business_id).single();
      const leadName = name || email || phone || "Website enquiry";
      // leads.user_id is NOT NULL — always have a valid owner id.
      const ownerId: string | null = biz?.user_id ?? null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error: leadErr } = await (sb as any).rpc("upsert_lead", {
          p_business_id: form.business_id,
          p_user_id: ownerId,
          p_name: leadName,
          p_email: email || null,
          p_phone: phone || null,
          p_address: null, p_suburb: null, p_service: null,
          p_property_type: null, p_timing: null,
          p_notes: `Submitted via form "${form.name}"`,
          p_source: "form",
          p_source_ref: slug,
        }).single();
        if (leadErr) {
          console.error("[form-submit] upsert_lead failed:", leadErr.message ?? leadErr, leadErr.details ?? "", leadErr.hint ?? "");
          // Fallback: dedup-aware insert isn't available, so do a plain insert
          // (still better than losing the lead). Skip if we have no owner id.
          if (ownerId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: ins, error: insErr } = await tbl(sb, "leads").insert({
              business_id: form.business_id, user_id: ownerId, name: leadName,
              email: email || null, phone: phone || null, status: "new",
              source: "form", notes: `Submitted via form "${form.name}" (${slug})`,
            }).select("id").single();
            if (insErr) console.error("[form-submit] lead insert fallback failed:", insErr.message);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else leadId = (ins as any)?.id ?? null;
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          leadId = (created as any)?.id ?? null;
        }
        // This route calls upsert_lead directly rather than createLead(), so
        // until now a public form submission fired NOTHING — the one use case
        // automations were wanted for had no trigger signal at all.
        if (leadId) {
          await emitAutomationEvent(sb, form.business_id, "lead.created", "lead", leadId);
        }
      } catch (e) {
        console.error("[form-submit] lead creation threw:", e instanceof Error ? e.message : e);
      }
    }
  }

  const { error } = await tbl(sb, "public_form_submissions").insert({
    business_id: form.business_id, form_id: form.id, answers: stored,
    lead_id: leadId, invite_id: invite?.id ?? null, meta,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Stamp the invite so the lead's card reads "answered" rather than "waiting",
  // and so a resend reuses nothing that's already been filled in.
  if (invite) {
    await tbl(sb, "public_form_invites")
      .update({ submitted_at: new Date().toISOString() }).eq("id", invite.id);
  }

  // Notify (best-effort).
  const notify = settings.notify_emails ?? [];
  if (notify.length > 0) {
    try {
      const { data: biz } = await tbl(sb, "businesses").select("name, email").eq("id", form.business_id).single();

      // ESCAPE EVERYTHING. `answers` is whatever an anonymous stranger typed
      // into a public form; interpolated raw it lands as live HTML in the
      // owner's inbox, in an email they trust because it came from their own
      // form. A link reading "view invoice" pointing anywhere is enough.
      // `f.label` and `form.name` are business-authored and lower risk, but
      // there is no reason for any of it to be raw.
      const rows = schema.filter((f) => !["heading", "divider", "instructions"].includes(f.type))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f) => `<tr><td style="padding:4px 10px;color:#666">${esc(f.label ?? "")}</td><td style="padding:4px 10px"><strong>${esc(fmt((answers as any)[f.id]))}</strong></td></tr>`).join("");
      const formName = esc(form.name ?? "");
      const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:24px"><h1 style="font-size:18px;margin:0 0 12px">New submission: ${formName}</h1><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>${leadId ? '<p style="font-size:12px;color:#2f6f73;margin-top:12px">✓ A lead was created in your pipeline.</p>' : ""}</div></body></html>`;
      await sendEmail({
        to: notify, subject: `New form submission — ${form.name}`, html,
        // No `slug` here: `businesses` has no such column (only `audit_slug`),
        // the select above doesn't ask for one, and `tbl()` returns `any` so
        // TypeScript never flagged the undefined it was quietly passing.
        from: buildBusinessFrom({ name: biz?.name ?? "Kirei", localPart: "forms" }),
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
