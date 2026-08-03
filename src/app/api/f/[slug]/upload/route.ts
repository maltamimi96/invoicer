import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/booking/public";
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

/** Public file/image upload for a form field (slug-gated, rate-limited). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = clientIp(req);
  if (!rateLimit(`formup:${slug}:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many uploads — please wait." }, { status: 429 });
  }

  const sb = createAdminClient();
  const { data: form } = await tbl(sb, "public_forms")
    .select("id, business_id, status, schema").eq("slug", slug).maybeSingle();
  if (!form || form.status !== "published") return NextResponse.json({ error: "Form not found" }, { status: 404 });

  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const file = fd.get("file");
  const fieldId = String(fd.get("field_id") ?? "");
  if (!(file instanceof File) || !fieldId) return NextResponse.json({ error: "file and field_id required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be under 4 MB" }, { status: 413 });

  const field = ((form.schema ?? []) as OnboardingField[]).find((x) => x.id === fieldId);
  if (!field || (field.type !== "file" && field.type !== "image")) return NextResponse.json({ error: "Unknown upload field" }, { status: 400 });
  if (field.type === "image" && !IMAGE_TYPES.test(file.type)) return NextResponse.json({ error: "Please upload an image" }, { status: 415 });

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${form.business_id}/${form.id}/${fieldId}-${randomBytes(6).toString("hex")}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from("public-form-uploads").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, name: file.name, size: file.size, type: file.type || null });
}
