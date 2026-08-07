/**
 * SMS — the session-free layer.
 *
 * `actions/sms.ts` resolves the business from `getUser()`, which means a cron,
 * a webhook or an automation can't send a text: there is no session. This
 * module takes the business id explicitly, so anything with a Supabase client
 * can use it.
 *
 * It also ends a duplicate: the ClickSend HTTP call existed twice, in
 * `actions/sms.ts` and `booking/notify.ts`, with different error handling.
 * One copy now.
 *
 * Plain module — no "use server". Import it from actions, routes and crons.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: Sb, name: string) => sb.from(name);

interface ClickSendResponse {
  http_code: number;
  data?: { messages?: Array<{ message_id?: string; status?: string }> };
  response_msg?: string;
}

/** True when the server can send at all. Check before offering SMS as an
 *  action, so an automation fails at save time rather than at 3am. */
export function smsConfigured(): boolean {
  return Boolean(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY);
}

/**
 * An 11-character alphanumeric Sender ID — what shows as the "from" on the
 * recipient's phone. ClickSend rejects anything longer.
 */
export function deriveSenderId(name: string): string {
  return (name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 11)) || "Kirei";
}

/** POST a single SMS through ClickSend. Returns the provider message id +
 *  status. Throws with the API's error message on failure. */
export async function clickSendSend(
  args: { from: string; to: string; body: string },
): Promise<{ id: string; status: string }> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) throw new Error("ClickSend credentials not configured");

  const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      messages: [{ from: args.from, to: args.to, body: args.body, source: "kirei" }],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as ClickSendResponse;
  if (!res.ok || json.http_code !== 200) {
    throw new Error(`SMS send failed: ${json.response_msg ?? res.statusText}`);
  }
  const msg = json.data?.messages?.[0];
  return { id: msg?.message_id ?? "", status: msg?.status ?? "sent" };
}

export interface SendSmsForResult {
  conversationId: string;
  messageId: string;
  providerId: string;
}

/**
 * Send a text on behalf of a business and record it in the conversation.
 *
 * The business id is a parameter, not something read from a session — that's
 * the whole point of this function existing.
 */
export async function sendSmsFor(
  sb: Sb,
  businessId: string,
  payload: { to: string; body: string; customerName: string; customerId?: string | null },
): Promise<SendSmsForResult> {
  // The Sender ID the recipient sees: the business's own if set, otherwise
  // derived from its name — never a bare number they won't recognise.
  const { data: business } = await tbl(sb, "businesses")
    .select("name, sms_sender_id").eq("id", businessId).single();
  const fromName = business?.sms_sender_id?.trim() || deriveSenderId(business?.name ?? "Kirei");

  let { data: conv } = await tbl(sb, "sms_conversations")
    .select("id").eq("business_id", businessId).eq("customer_phone", payload.to).maybeSingle();

  if (!conv) {
    const { data: created, error } = await tbl(sb, "sms_conversations").insert({
      business_id: businessId,
      customer_id: payload.customerId ?? null,
      customer_name: payload.customerName,
      customer_phone: payload.to,
      last_message_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    conv = created;
  }

  const sent = await clickSendSend({ from: fromName, to: payload.to, body: payload.body });

  // twilio_sid holds the ClickSend message id — schema compatibility from the
  // provider switch, renameable later.
  const { data: msg, error: msgErr } = await tbl(sb, "sms_messages").insert({
    conversation_id: conv.id,
    business_id: businessId,
    direction: "outbound",
    body: payload.body,
    from_number: fromName,
    to_number: payload.to,
    twilio_sid: sent.id,
    status: sent.status,
  }).select("id").single();
  if (msgErr) throw msgErr;

  await tbl(sb, "sms_conversations")
    .update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  return { conversationId: conv.id, messageId: msg.id, providerId: sent.id };
}
