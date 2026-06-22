"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveBizId } from "@/lib/active-business";
import { getUser } from "@/lib/auth";
import { renderTemplateVars } from "@/lib/emails/templates";
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
  source_path?: string | null;    // for pdf (from uploadContractPdf)
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

/** Upload a source PDF to the private contracts bucket; returns its storage path. */
export async function uploadContractPdf(formData: FormData): Promise<{ path: string }> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (file.type !== "application/pdf") throw new Error("Only PDF files are supported");
  if (file.size > 15 * 1024 * 1024) throw new Error("PDF must be under 15 MB");

  const admin = createAdminClient();
  const path = `${businessId}/${Date.now()}-${randomBytes(6).toString("hex")}.pdf`;
  const bytes = Buffer.from(await file.arrayBuffer());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).storage.from("contracts").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return { path };
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

/** True when the platform Dropbox Sign account is configured. */
export async function isSigningEnabled(): Promise<boolean> {
  return Boolean(process.env.DROPBOX_SIGN_API_KEY);
}

/**
 * Send a contract to its customer for e-signature via Dropbox Sign (one platform account).
 * PDF contracts are sent as-is; rich-text contracts are flattened to a simple PDF.
 * Records the provider request id and flips the contract to "sent".
 */
export async function sendContractForSignature(contractId: string): Promise<{ ok: true }> {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  if (!apiKey) throw new Error("E-signature isn't configured. Add DROPBOX_SIGN_API_KEY to enable it.");

  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: c } = await tbl(supabase, "contracts")
    .select("*, customers(name, email)").eq("id", contractId).eq("business_id", businessId).single();
  if (!c) throw new Error("Contract not found");
  if (c.status !== "draft") throw new Error("Only draft contracts can be sent");
  const signerEmail = c.customers?.email as string | undefined;
  const signerName = (c.customers?.name as string | undefined) ?? "Customer";
  if (!signerEmail) throw new Error("This customer has no email address");

  const { data: biz } = await tbl(supabase, "businesses").select("name").eq("id", businessId).single();

  // Build the multipart request to Dropbox Sign.
  const form = new FormData();
  form.append("title", c.title);
  form.append("subject", `${biz?.name ?? "Contract"}: ${c.title}`);
  form.append("message", "Please review and sign this contract.");
  form.append("signers[0][email_address]", signerEmail);
  form.append("signers[0][name]", signerName);
  if (process.env.DROPBOX_SIGN_TEST_MODE === "1") form.append("test_mode", "1");

  const admin = createAdminClient();
  if (c.kind === "pdf" && c.source_path) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: blob, error } = await (admin as any).storage.from("contracts").download(c.source_path);
    if (error || !blob) throw new Error("Could not read the contract PDF");
    form.append("file[0]", blob, "contract.pdf");
  } else {
    // Flatten rich-text to a minimal HTML "file" — Dropbox Sign accepts .html uploads.
    const html = await renderContractHtml(contractId);
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;padding:40px;color:#111}</style></head><body><h1>${c.title}</h1>${html}</body></html>`;
    form.append("file[0]", new Blob([doc], { type: "text/html" }), "contract.html");
  }

  const resp = await fetch("https://api.hellosign.com/v3/signature_request/send", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64") },
    body: form,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Dropbox Sign error (${resp.status}): ${txt.slice(0, 300)}`);
  }
  const json = await resp.json();
  const requestId: string | undefined = json?.signature_request?.signature_request_id;

  const { error: upErr } = await tbl(supabase, "contracts").update({
    status: "sent", provider: "dropbox_sign", provider_request_id: requestId ?? null,
    signer_name: signerName, signer_email: signerEmail, sent_at: new Date().toISOString(),
  }).eq("id", contractId).eq("business_id", businessId);
  if (upErr) throw upErr;

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  return { ok: true };
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
