import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAnswersForStorage, missingRequiredFields, invalidAnswerFields } from "@/lib/onboarding/answers";
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

  let stored;
  try {
    stored = processAnswersForStorage(schema, merged);
  } catch (e) {
    // Secure field present but ONBOARDING_SECRET_KEY missing on the server.
    const msg = e instanceof Error ? e.message : "Could not save secure fields";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const row = {
    business_id: link.business_id, request_id: id, form_id: request.form_id,
    customer_id: link.customer_id, answers: stored, schema_snapshot: schema,
    draft: !body.submit, ...(body.submit ? { submitted_at: nowIso } : {}),
  };
  const { error } = existing
    ? await tbl(sb, "onboarding_responses").update(row).eq("id", existing.id)
    : await tbl(sb, "onboarding_responses").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.submit) {
    await tbl(sb, "onboarding_requests")
      .update({ status: "completed", completed_at: nowIso }).eq("id", id);
  } else if (request.status === "pending") {
    await tbl(sb, "onboarding_requests")
      .update({ status: "viewed", viewed_at: nowIso }).eq("id", id);
  }

  return NextResponse.json({ ok: true, submitted: !!body.submit });
}
