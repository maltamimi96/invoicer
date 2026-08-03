"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { mintUpload, assertSize, safeExt, UPLOAD_LIMITS, type SignedUpload } from "@/lib/uploads";
import { getUser } from "@/lib/auth";
import { renderTemplateVars } from "@/lib/emails/templates";
import { appUrl } from "@/lib/app-url";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import type { Contract, ContractTemplate } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Awaited<ReturnType<typeof createClient>>, name: string) => (sb as any).from(name);

// ── Templates ──────────────────────────────────────────────────────────────
export async function getContractTemplates(): Promise<ContractTemplate[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "contract_templates")
    .select("*").eq("business_id", businessId).order("name");
  if (error) throw error;
  return (data ?? []) as ContractTemplate[];
}

export async function createContractTemplate(name: string, contentHtml: string): Promise<ContractTemplate> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!name?.trim()) throw new Error("Template name is required");
  const { data, error } = await tbl(supabase, "contract_templates")
    .insert({ business_id: businessId, name: name.trim(), content_html: contentHtml ?? "" })
    .select().single();
  if (error) throw error;
  revalidatePath("/contracts");
  return data as ContractTemplate;
}

export async function updateContractTemplate(id: string, updates: { name?: string; content_html?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "contract_templates").update(updates).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/contracts");
}

export async function deleteContractTemplate(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "contract_templates").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/contracts");
}

// ── Contracts ──────────────────────────────────────────────────────────────
export async function getContracts(): Promise<Contract[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "contracts")
    .select("id, business_id, customer_id, title, kind, status, signer_name, signer_email, sent_at, signed_at, created_at")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Contract[];
}

export async function getContract(id: string): Promise<Contract & { customers?: { name: string; email: string | null } | null }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data, error } = await tbl(supabase, "contracts")
    .select("*, customers(name, email)").eq("id", id).eq("business_id", businessId).single();
  if (error) throw error;
  return data as Contract & { customers?: { name: string; email: string | null } | null };
}

export interface CreateContractInput {
  title: string;
  customer_id: string;
  kind: "rich_text" | "pdf";
  content_html?: string | null;   // for rich_text
  source_path?: string | null;    // for pdf (from createContractPdfUpload)
}

export async function createContract(input: CreateContractInput): Promise<Contract> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  if (!input.title?.trim()) throw new Error("A title is required");
  if (!input.customer_id) throw new Error("A customer is required");
  if (input.kind === "rich_text" && !input.content_html?.trim()) throw new Error("Contract content is required");
  if (input.kind === "pdf" && !input.source_path) throw new Error("Upload a PDF first");

  const { data, error } = await tbl(supabase, "contracts").insert({
    business_id: businessId, user_id: user.id, customer_id: input.customer_id,
    title: input.title.trim(), kind: input.kind,
    content_html: input.kind === "rich_text" ? input.content_html : null,
    source_path: input.kind === "pdf" ? input.source_path : null,
    status: "draft",
  }).select().single();
  if (error) throw error;
  revalidatePath("/contracts");
  return data as Contract;
}

export async function updateContract(id: string, updates: { title?: string; content_html?: string }): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  // Only draft contracts are editable.
  const { data: c } = await tbl(supabase, "contracts").select("status").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (c && c.status !== "draft") throw new Error("Only draft contracts can be edited");
  const { error } = await tbl(supabase, "contracts").update(updates).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/contracts");
}

export async function deleteContract(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "contracts").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath("/contracts");
}

export async function voidContract(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { error } = await tbl(supabase, "contracts").update({ status: "voided" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/contracts");
}

/**
 * Mint a signed URL the browser uploads the contract PDF straight to.
 *
 * A scanned contract comfortably exceeds the 1MB server-action body cap — see
 * src/lib/uploads.ts. The path always ends `.pdf` (server-chosen), so a
 * mis-declared content type can't change what the file is stored as.
 */
export async function createContractPdfUpload(
  fileName: string, mimeType: string, sizeBytes: number,
): Promise<SignedUpload> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  if (mimeType !== "application/pdf" && safeExt(fileName, "") !== "pdf") {
    throw new Error("Only PDF files are supported");
  }
  assertSize(sizeBytes, UPLOAD_LIMITS.contractPdf, "PDF");

  const path = `${businessId}/${Date.now()}-${randomBytes(6).toString("hex")}.pdf`;
  return mintUpload("contracts", path);
}

/** Signed URL (1h) for a contract's source or signed PDF, served from the private bucket. */
export async function getContractPdfUrl(contractId: string, which: "source" | "signed" = "source"): Promise<string | null> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data: c } = await tbl(supabase, "contracts")
    .select("source_path, signed_path").eq("id", contractId).eq("business_id", businessId).single();
  const path = which === "signed" ? c?.signed_path : c?.source_path;
  if (!path) return null;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage.from("contracts").createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

/** Native in-app signing is always available — no third-party setup required. */
export async function isSigningEnabled(): Promise<boolean> {
  return true;
}

/** Mint (or reuse) a customer portal token and return the deep link to sign this contract. */
async function contractSignUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string, customerId: string, userId: string, contractId: string,
): Promise<{ token: string; url: string }> {
  const { data: existing } = await tbl(supabase, "customer_portal_tokens")
    .select("token").eq("business_id", businessId).eq("customer_id", customerId)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let token: string | null = existing?.token ?? null;
  if (!token) {
    token = "cust_" + randomBytes(24).toString("hex");
    const { error } = await tbl(supabase, "customer_portal_tokens").insert({
      token, business_id: businessId, customer_id: customerId, created_by: userId,
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    });
    if (error) throw error;
  }
  return { token, url: `${appUrl()}/portal/${token}/contract/${contractId}` };
}

/** Returns the signing link for a contract (mints a portal token if needed). */
export async function getContractSignLink(contractId: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data: c } = await tbl(supabase, "contracts")
    .select("customer_id").eq("id", contractId).eq("business_id", businessId).single();
  if (!c?.customer_id) throw new Error("This contract has no customer to sign it");
  const { url } = await contractSignUrl(supabase, businessId, c.customer_id, user.id, contractId);
  return { url };
}

/**
 * Send a contract to its customer for native in-app e-signature: mints a portal
 * link and emails it to the customer, then flips the contract to "sent".
 */
export async function sendContractForSignature(contractId: string): Promise<{ ok: true; url: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: c } = await tbl(supabase, "contracts")
    .select("id, status, customer_id, title, customers(name, email)")
    .eq("id", contractId).eq("business_id", businessId).single();
  if (!c) throw new Error("Contract not found");
  if (c.status === "signed") throw new Error("This contract is already signed");
  if (c.status === "voided") throw new Error("This contract has been voided");
  if (!c.customer_id) throw new Error("This contract has no customer");
  const signerEmail = c.customers?.email as string | undefined;
  const signerName = (c.customers?.name as string | undefined) ?? "Customer";
  if (!signerEmail) throw new Error("This customer has no email address");

  const { data: biz } = await tbl(supabase, "businesses").select("name, email").eq("id", businessId).single();
  const { url } = await contractSignUrl(supabase, businessId, c.customer_id, user.id, contractId);

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f6f4;padding:24px;color:#111">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e3d9;padding:28px">
      <p style="font-size:13px;color:#666;margin:0 0 4px">${biz?.name ?? "Your provider"}</p>
      <h1 style="font-size:20px;margin:0 0 12px">Please sign: ${c.title}</h1>
      <p style="font-size:14px;line-height:1.6;color:#333">Hi ${signerName}, you have a contract ready to review and sign. Click below to open it and add your signature — it only takes a minute.</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#2f6f73;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Review &amp; sign</a></p>
      <p style="font-size:12px;color:#888">Or paste this link into your browser:<br>${url}</p>
    </div></body></html>`;

  await sendEmail({
    to: signerEmail,
    subject: `${biz?.name ?? "Contract"}: please sign “${c.title}”`,
    html,
    from: buildBusinessFrom({ name: biz?.name ?? "Kirei", slug: biz?.slug, localPart: "contracts" }),
    replyTo: biz?.email ?? undefined,
    tags: { business_id: businessId, doc_type: "custom", doc_id: contractId },
  });

  const { error: upErr } = await tbl(supabase, "contracts").update({
    status: "sent", provider: "native",
    signer_name: signerName, signer_email: signerEmail, sent_at: new Date().toISOString(),
  }).eq("id", contractId).eq("business_id", businessId);
  if (upErr) throw upErr;

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  return { ok: true, url };
}

/** Render contract HTML with merge fields filled, for preview / signing. */
export async function renderContractHtml(contractId: string): Promise<string> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);
  const { data: c } = await tbl(supabase, "contracts")
    .select("content_html, customer_id").eq("id", contractId).eq("business_id", businessId).single();
  if (!c?.content_html) return "";
  const [{ data: biz }, { data: cust }] = await Promise.all([
    tbl(supabase, "businesses").select("name, email, phone, address").eq("id", businessId).single(),
    c.customer_id ? tbl(supabase, "customers").select("name, email, company, address").eq("id", c.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return renderTemplateVars(c.content_html, {
    customer_name: cust?.name ?? "",
    customer_company: cust?.company ?? "",
    customer_email: cust?.email ?? "",
    customer_address: cust?.address ?? "",
    business_name: biz?.name ?? "",
    business_email: biz?.email ?? "",
    business_phone: biz?.phone ?? "",
    business_address: biz?.address ?? "",
    date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  });
}
