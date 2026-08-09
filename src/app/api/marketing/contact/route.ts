import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
// Shared with the public booking + form endpoints — same guard, same limiter.
import { rateLimit } from "@/lib/booking/public";

/**
 * Contact-sales enquiries.
 *
 * Public and unauthenticated, so it carries the same two guards the public
 * form endpoint uses: a honeypot field bots fill in and humans never see, and
 * a per-IP rate limit. Without them this is a spam relay pointed at your inbox.
 *
 * Where it goes: SALES_INBOX_EMAIL, falling back to the verified Resend
 * sender. If neither is configured the enquiry is logged and the caller still
 * gets a success — losing a lead is bad, but telling a prospect "something
 * went wrong" when the fault is our configuration is worse.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`contact:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many enquiries — try again in a minute." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  // Honeypot: a real person never sees this field.
  if (typeof body._hp === "string" && body._hp.trim()) {
    return NextResponse.json({ ok: true });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(body.name), email = str(body.email);
  const company = str(body.company), solution = str(body.solution), message = str(body.message);

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email and a message are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  const to = process.env.SALES_INBOX_EMAIL ?? process.env.RESEND_FROM_EMAIL;
  if (!to) {
    console.error("[contact] no SALES_INBOX_EMAIL or RESEND_FROM_EMAIL set; enquiry:", { name, email, company, solution });
    return NextResponse.json({ ok: true });
  }

  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  try {
    await sendEmail({
      to,
      // Reply goes to the prospect, so hitting reply in the inbox just works.
      replyTo: email,
      subject: `Kirei enquiry — ${name}${company ? ` (${company})` : ""}`,
      html: `
        <h2>New enquiry</h2>
        <p><strong>Name:</strong> ${esc(name)}<br>
           <strong>Email:</strong> ${esc(email)}<br>
           ${company ? `<strong>Company:</strong> ${esc(company)}<br>` : ""}
           ${solution ? `<strong>Interested in:</strong> ${esc(solution)}<br>` : ""}</p>
        <p style="white-space:pre-wrap">${esc(message)}</p>`,
    });
  } catch (e) {
    console.error("[contact] send failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't send that just now. Email us directly instead." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
