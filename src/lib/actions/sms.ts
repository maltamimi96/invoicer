"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => (sb as any).from(name);

/** Sanitise a business name down to an 11-char alphanumeric Sender ID for AU SMS.
 *  Strips non-alphanum, prefers PascalCase abbreviation.
 *  e.g. "Crown Roofers" → "CrownRoof", "Bob's Plumbing & Gas" → "BobsPlumbng" */
function deriveSenderId(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, "");
  return cleaned.slice(0, 11) || "Kirei";
}

interface ClickSendResponse {
  http_code: number;
  data?: { messages?: Array<{ message_id?: string; status?: string }> };
  response_msg?: string;
}

/** POST a single SMS through ClickSend. Returns the provider message id +
 *  status. Throws with the API's error message on failure. */
async function clicksendSend(args: { from: string; to: string; body: string }): Promise<{ id: string; status: string }> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) throw new Error("ClickSend credentials not configured");

  const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify({
      messages: [{ from: args.from, to: args.to, body: args.body, source: "kirei" }],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as ClickSendResponse;
  if (!res.ok || json.http_code !== 200) {
    throw new Error(`SMS send failed: ${json.response_msg ?? res.statusText}`);
  }
  const msg = json.data?.messages?.[0];
  return {
    id:     msg?.message_id ?? "",
    status: msg?.status     ?? "sent",
  };
}

export interface SmsConversation {
  id: string;
  business_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  unread_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface SmsMessage {
  id: string;
  conversation_id: string;
  business_id: string;
  direction: "outbound" | "inbound";
  body: string;
  from_number: string;
  to_number: string;
  twilio_sid: string | null;
  status: string;
  created_at: string;
}

export async function getConversations(): Promise<SmsConversation[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "sms_conversations")
    .select("*")
    .eq("business_id", businessId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as SmsConversation[];
}

export async function getMessages(conversationId: string): Promise<SmsMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "sms_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SmsMessage[];
}

export async function sendSms(payload: {
  to: string;           // E.164 phone, e.g. +61412345678
  body: string;
  customerName: string;
  customerId?: string | null;
}): Promise<{ conversationId: string; messageId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  // Resolve the Sender ID — use the business's saved sms_sender_id if set,
  // otherwise derive an 11-char alpha tag from their name. Customers see this
  // as the "from" on their phone instead of an unfamiliar number.
  const { data: business } = await tbl(supabase, "businesses")
    .select("name, sms_sender_id")
    .eq("id", businessId)
    .single();
  const fromName = business?.sms_sender_id?.trim() || deriveSenderId(business?.name ?? "Kirei");

  // Get or create conversation
  let { data: conv } = await tbl(supabase, "sms_conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_phone", payload.to)
    .maybeSingle();

  if (!conv) {
    const { data: newConv, error: convErr } = await tbl(supabase, "sms_conversations")
      .insert({
        business_id: businessId,
        customer_id: payload.customerId ?? null,
        customer_name: payload.customerName,
        customer_phone: payload.to,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conv = newConv;
  }

  // Send via ClickSend
  const sent = await clicksendSend({
    from: fromName,
    to:   payload.to,
    body: payload.body,
  });

  // Save message to DB. We reuse the existing twilio_sid column to store the
  // ClickSend message id — schema-compat for now, can rename later.
  const { data: msg, error: msgErr } = await tbl(supabase, "sms_messages")
    .insert({
      conversation_id: conv.id,
      business_id: businessId,
      direction: "outbound",
      body: payload.body,
      from_number: fromName,
      to_number: payload.to,
      twilio_sid: sent.id,
      status: sent.status,
    })
    .select("id")
    .single();
  if (msgErr) throw msgErr;

  // Update conversation last_message_at
  await tbl(supabase, "sms_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  revalidatePath("/messages");
  return { conversationId: conv.id, messageId: msg.id };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  await tbl(supabase, "sms_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("business_id", businessId);
}

export async function startConversation(payload: {
  customerPhone: string;
  customerName: string;
  customerId?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  // Check if conversation already exists
  const { data: existing } = await tbl(supabase, "sms_conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_phone", payload.customerPhone)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await tbl(supabase, "sms_conversations")
    .insert({
      business_id: businessId,
      customer_id: payload.customerId ?? null,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
    })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/messages");
  return data.id as string;
}
