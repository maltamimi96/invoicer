/**
 * Deliver a white-label SEO report to the client (docs/SEO_AGENCY_PLAN.md P3).
 * Mints/reuses a customer portal token, emails a branded link via the
 * per-business sender, and marks the report sent. Shared by the server action
 * and the MCP tool. Server-only.
 */
import { randomBytes } from "node:crypto";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { appUrl } from "@/lib/app-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mintToken(sb: any, businessId: string, customerId: string, userId: string): Promise<string> {
  const { data: existing } = await sb.from("customer_portal_tokens")
    .select("token").eq("business_id", businessId).eq("customer_id", customerId)
    .is("revoked_at", null).or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .limit(1).maybeSingle();
  if (existing?.token) return existing.token;
  const token = "cust_" + randomBytes(24).toString("hex");
  await sb.from("customer_portal_tokens").insert({
    token, business_id: businessId, customer_id: customerId, created_by: userId,
    expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  });
  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deliverSeoReport(sb: any, businessId: string, userId: string, reportId: string): Promise<{ link: string }> {
  const { data: report } = await sb.from("seo_reports")
    .select("id, seo_sites(domain, customer_id)").eq("id", reportId).eq("business_id", businessId).maybeSingle();
  if (!report) throw new Error("Report not found");
  const customerId = report.seo_sites?.customer_id;
  if (!customerId) throw new Error("Link a client (customer) to this site before sending.");

  const [{ data: customer }, { data: business }] = await Promise.all([
    sb.from("customers").select("name, email").eq("id", customerId).maybeSingle(),
    sb.from("businesses").select("name, email").eq("id", businessId).maybeSingle(),
  ]);
  if (!customer?.email) throw new Error("The linked client has no email address.");

  const token = await mintToken(sb, businessId, customerId, userId);
  const link = `${appUrl()}/portal/${token}/seo-report/${reportId}`;
  const domain = report.seo_sites?.domain ?? "your site";

  const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 8px">Your SEO report is ready</h2>
    <p>Hi ${customer.name ?? "there"}, your latest SEO report for <strong>${domain}</strong> is ready to view.</p>
    <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#047857;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">View your report</a></p>
    <p style="color:#64748b;font-size:12px;word-break:break-all">${link}</p>
  </div>`;

  await sendEmail({
    to: customer.email,
    subject: `Your SEO report — ${domain}`,
    html,
    from: buildBusinessFrom({ name: business?.name ?? "Kirei", localPart: "reports" }),
    replyTo: business?.email ?? undefined,
    tags: { business_id: businessId, doc_type: "custom", doc_id: reportId },
  });

  await sb.from("seo_reports").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", reportId);
  return { link };
}
