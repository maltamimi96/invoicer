import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingField } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

// Vercel rejects any serverless request body over 4.5MB, so a larger limit
// here would be a promise the platform breaks — the caller would get an opaque
// 413 from the edge instead of this route's message. Public uploads keep
// travelling through the route (rather than a signed URL straight to storage)
// because these endpoints are unauthenticated: the server-side size and type
// check is the only gate before bytes land in the bucket.
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;

/** Customer file/image upload for an onboarding field (token-gated). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const sb = createAdminClient();

  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 410 });

  const { data: request } = await tbl(sb, "onboarding_requests")
    .select("id, form_id").eq("id", id)
    .eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const file = form.get("file");
  const fieldId = String(form.get("field_id") ?? "");
  if (!(file instanceof File) || !fieldId) return NextResponse.json({ error: "file and field_id are required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be under 4 MB" }, { status: 413 });

  // The field must exist on the form and be an upload type.
  const { data: f } = await tbl(sb, "onboarding_forms").select("schema").eq("id", request.form_id).maybeSingle();
  const field = ((f?.schema ?? []) as OnboardingField[]).find((x) => x.id === fieldId);
  if (!field || (field.type !== "file" && field.type !== "image")) {
    return NextResponse.json({ error: "Unknown upload field" }, { status: 400 });
  }
  if (field.type === "image" && !IMAGE_TYPES.test(file.type)) {
    return NextResponse.json({ error: "Please upload an image (PNG, JPG, WEBP…)" }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${link.business_id}/${id}/${fieldId}-${randomBytes(6).toString("hex")}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from("onboarding-uploads")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    path, name: file.name, size: file.size, type: file.type || null,
  });
}
