"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => (sb as any).from(name);

function getTwilioClient() {
  const { Twilio } = require("twilio") as typeof import("twilio");
  return new Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
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

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) throw new Error("TWILIO_PHONE_NUMBER env var is not set");

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

  // Send via Twilio
  const twilio = getTwilioClient();
  const twilioMsg = await twilio.messages.create({
    from: fromNumber,
    to: payload.to,
    body: payload.body,
  });

  // Save message to DB
  const { data: msg, error: msgErr } = await tbl(supabase, "sms_messages")
    .insert({
      conversation_id: conv.id,
      business_id: businessId,
      direction: "outbound",
      body: payload.body,
      from_number: fromNumber,
      to_number: payload.to,
      twilio_sid: twilioMsg.sid,
      status: twilioMsg.status ?? "sent",
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
