import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAnswersForStorageSafe, missingRequiredFields, invalidAnswerFields } from "@/lib/onboarding/answers";
import type { OnboardingField } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Autosave (draft) or final-submit a customer's onboarding answers.
 *  Token-gated: the portal token must belong to the request's customer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { answers?: Record<string, any>; submit?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const sb = createAdminClient();
  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 410 });

  const { data: request } = await tbl(sb, "onboarding_requests")
    .select("id, form_id, status").eq("id", id)
    .eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const { data: form } = await tbl(sb, "onboarding_forms")
    .select("schema, settings").eq("id", request.form_id).maybeSingle();
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  const schema = (form.schema ?? []) as OnboardingField[];

  if (request.status === "completed" && !form.settings?.allow_edit_after_submit) {
    return NextResponse.json({ error: "This form has already been submitted" }, { status: 409 });
  }

  // Merge over any existing draft so autosaves can send partial patches.
  const { data: existing } = await tbl(sb, "onboarding_responses")
    .select("id, answers").eq("request_id", id).maybeSingle();
  const merged = { ...(existing?.answers ?? {}), ...(body.answers ?? {}) };

  if (body.submit) {
    const missing = missingRequiredFields(schema, merged);
    const invalid = invalidAnswerFields(schema, merged);
    if (missing.length > 0 || invalid.length > 0) {
      return NextResponse.json({
        error: missing.length > 0 ? "Please fill in all required fields" : "Please fix the highlighted fields",
        missing, invalid,
      }, { status: 422 });
    }
  }

  // Encrypt what we can. A secure field that fails (server key missing or
  // malformed) used to 500 the ENTIRE payload, so a client who filled in twenty
  // fields and one credential lost all twenty and saw a server error naming an
  // env var they can't do anything about.
  const { stored, failed } = processAnswersForStorageSafe(schema, merged);

  // A failed field is never written as plaintext, so re-instate whatever was
  // already stored for it — otherwise a retry that fails again would also wipe
  // a value saved successfully on an earlier pass.
  for (const id of failed) {
    const prior = (existing?.answers as Record<string, unknown> | undefined)?.[id];
    if (prior !== undefined) stored[id] = prior as never;
  }

  // Don't call a submission complete when part of it didn't save.
  const submitting = Boolean(body.submit) && failed.length === 0;

  const nowIso = new Date().toISOString();
  const row = {
    business_id: link.business_id, request_id: id, form_id: request.form_id,
    customer_id: link.customer_id, answers: stored, schema_snapshot: schema,
    draft: !submitting, ...(submitting ? { submitted_at: nowIso } : {}),
  };
  const { error } = existing
    ? await tbl(sb, "onboarding_responses").update(row).eq("id", existing.id)
    : await tbl(sb, "onboarding_responses").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (submitting) {
    await tbl(sb, "onboarding_requests")
      .update({ status: "completed", completed_at: nowIso }).eq("id", id);
  } else if (request.status === "pending") {
    await tbl(sb, "onboarding_requests")
      .update({ status: "viewed", viewed_at: nowIso }).eq("id", id);
  }

  // Everything else is saved; report the fields that aren't so the client can
  // highlight them. 422 rather than 500 — the payload was fine, one field
  // couldn't be secured, and that is a fixable state, not a crash.
  if (failed.length > 0) {
    return NextResponse.json({
      error: "Secure fields couldn't be saved — everything else was. Please re-enter them.",
      failed,
      saved: true,
    }, { status: 422 });
  }

  return NextResponse.json({ ok: true, submitted: submitting });
}
