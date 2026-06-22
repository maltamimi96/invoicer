import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fillMergeFields, htmlToParagraphs } from "@/lib/contracts/render";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  let body: { name?: string; method?: "typed" | "drawn"; signature?: string; consent?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  const method = body.method === "drawn" ? "drawn" : "typed";
  if (!name) return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  if (!body.consent) return NextResponse.json({ error: "You must agree before signing" }, { status: 400 });
  if (method === "drawn" && !body.signature?.startsWith("data:image/")) {
    return NextResponse.json({ error: "Please draw your signature" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data: link } = await tbl(sb, "customer_portal_tokens")
    .select("business_id, customer_id, expires_at, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "Link expired" }, { status: 410 });

  const { data: c } = await tbl(sb, "contracts")
    .select("*").eq("id", id).eq("business_id", link.business_id).eq("customer_id", link.customer_id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (c.status === "signed") return NextResponse.json({ ok: true, already: true });
  if (c.status === "voided") return NextResponse.json({ error: "This contract is no longer active" }, { status: 409 });

  const [{ data: biz }, { data: cust }] = await Promise.all([
    tbl(sb, "businesses").select("name, email, phone, address").eq("id", link.business_id).maybeSingle(),
    tbl(sb, "customers").select("name, company, email, address").eq("id", link.customer_id).maybeSingle(),
  ]);

  const now = new Date();
  const signedAtIso = now.toISOString();
  const signedAtLabel = now.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  // Build the signed PDF.
  let paragraphs: string[] = [];
  let attachmentNote: string | null = null;
  if (c.kind === "pdf") {
    attachmentNote = "This certifies electronic signature of the attached contract document (provided separately).";
  } else {
    const filled = fillMergeFields(c.content_html ?? "", {
      customer: cust, business: biz,
      date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    });
    paragraphs = htmlToParagraphs(filled);
  }

  let signedPath: string | null = null;
  let signaturePath: string | null = null;
  try {
    // Persist the drawn signature image (best-effort, for the audit record).
    if (method === "drawn" && body.signature) {
      const b64 = body.signature.split(",")[1] ?? "";
      const buf = Buffer.from(b64, "base64");
      signaturePath = `${link.business_id}/signatures/${id}.png`;
      await sb.storage.from("contracts").upload(signaturePath, buf, { contentType: "image/png", upsert: true });
    }

    const { renderToStream } = await import("@react-pdf/renderer");
    const { ContractPdfDocument } = await import("@/components/contracts/contract-pdf-document");
    const React = await import("react");
    const element = React.createElement(ContractPdfDocument, {
      title: c.title, businessName: biz?.name ?? "Contract", paragraphs, attachmentNote,
      signerName: name, signedAtLabel, signatureImage: method === "drawn" ? body.signature : null,
      signatureMethod: method, audit: { ip, userAgent, contractId: id },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const pdf = Buffer.concat(chunks);
    signedPath = `${link.business_id}/signed/${id}.pdf`;
    await sb.storage.from("contracts").upload(signedPath, pdf, { contentType: "application/pdf", upsert: true });
  } catch (e) {
    console.error("[contract-sign] pdf", e instanceof Error ? e.message : e);
    // Continue — the signature record is still valid even if PDF generation fails.
  }

  const audit = { ...(c.audit ?? {}), signed: { at: signedAtIso, ip, user_agent: userAgent, method, signature_path: signaturePath, consent: true } };
  const { error } = await tbl(sb, "contracts").update({
    status: "signed", provider: "native", signer_name: name, signed_at: signedAtIso,
    signed_path: signedPath, audit,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
