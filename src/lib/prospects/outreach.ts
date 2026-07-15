/**
 * Prospect outreach (PR3). Sends a (merge-fielded) email to prospects, honoring
 * the suppression list, appending an unsubscribe link, and logging an activity.
 * Shared by the server actions and the MCP tools. Server-only.
 */
import { randomBytes } from "node:crypto";
import { sendEmail, buildBusinessFrom } from "@/lib/email";
import { appUrl } from "@/lib/app-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function merge(tpl: string, p: any): string {
  const first = String(p.name ?? "").trim().split(/\s+/)[0] || "there";
  return tpl.replace(/\{\{\s*(name|first_name|company)\s*\}\}/gi, (_m, k: string) => {
    const key = k.toLowerCase();
    if (key === "first_name") return first;
    if (key === "company") return String(p.company ?? "");
    return String(p.name ?? "there");
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendToProspects(sb: any, businessId: string, userId: string, prospectIds: string[], subject: string, body: string): Promise<{ sent: number; skipped: number; failed: number }> {
  if (prospectIds.length === 0) return { sent: 0, skipped: 0, failed: 0 };
  const [{ data: business }, { data: prospects }, { data: supp }] = await Promise.all([
    sb.from("businesses").select("name, email").eq("id", businessId).maybeSingle(),
    sb.from("prospects").select("id, name, email, company, status, unsub_token").in("id", prospectIds).eq("business_id", businessId),
    sb.from("prospect_suppressions").select("email").eq("business_id", businessId),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suppressed = new Set(((supp ?? []) as any[]).map((s) => String(s.email).toLowerCase()));
  const from = buildBusinessFrom({ name: business?.name ?? "Kirei", localPart: "hello" });
  let sent = 0, skipped = 0, failed = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (prospects ?? []) as any[]) {
    if (!p.email || suppressed.has(String(p.email).toLowerCase())) { skipped++; continue; }
    let token: string = p.unsub_token;
    if (!token) { token = "u_" + randomBytes(16).toString("hex"); await sb.from("prospects").update({ unsub_token: token }).eq("id", p.id); }
    const unsubUrl = `${appUrl()}/unsubscribe/${token}`;
    const subj = merge(subject, p);
    const bodyHtml = merge(esc(body), p).replace(/\n/g, "<br>");
    const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.5">${bodyHtml}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px"><p style="font-size:11px;color:#94a3b8">You received this from ${esc(business?.name ?? "us")}. <a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>.</p></div>`;
    try {
      await sendEmail({ to: p.email, subject: subj, html, from, replyTo: business?.email ?? undefined, tags: { business_id: businessId, doc_type: "custom", doc_id: p.id } });
      await sb.from("prospect_activities").insert({ business_id: businessId, prospect_id: p.id, type: "email", summary: subj, created_by: userId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = { last_contacted_at: new Date().toISOString() };
      if (p.status === "new") patch.status = "contacted";
      await sb.from("prospects").update(patch).eq("id", p.id);
      sent++;
    } catch { failed++; }
  }
  return { sent, skipped, failed };
}
