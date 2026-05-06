"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";

export interface ScheduledSend {
  id: string;
  business_id: string;
  user_id: string;
  doc_type: "invoice" | "quote";
  doc_id: string;
  channel: "email" | "sms";
  send_at: string;
  recipients: string[] | null;
  to_phone: string | null;
  subject: string | null;
  body: string | null;
  status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: any, name: string) => sb.from(name);

/** Schedule an invoice/quote send for a specific moment in the future.
 *  Inputs are flat scalars so this is callable from the AI agent layer. */
export async function scheduleSend(input: {
  doc_type: "invoice" | "quote";
  doc_id: string;
  send_at: string;            // ISO timestamp
  channel?: "email" | "sms";
  recipients?: string[];      // for email
  to_phone?: string;          // for SMS
  subject?: string;
  body?: string;
}): Promise<ScheduledSend> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const sendAtDate = new Date(input.send_at);
  if (Number.isNaN(sendAtDate.getTime())) throw new Error("Invalid send_at");
  if (sendAtDate.getTime() <= Date.now() + 30_000) {
    throw new Error("Pick a time at least a minute in the future");
  }

  const channel = input.channel ?? "email";
  if (channel === "email" && (!input.recipients || input.recipients.length === 0)) {
    throw new Error("At least one recipient is required for email");
  }
  if (channel === "sms" && !input.to_phone) {
    throw new Error("Phone number is required for SMS");
  }

  const { data, error } = await tbl(supabase, "scheduled_sends")
    .insert({
      business_id: businessId,
      user_id: user.id,
      doc_type: input.doc_type,
      doc_id: input.doc_id,
      channel,
      send_at: sendAtDate.toISOString(),
      recipients: input.recipients ?? null,
      to_phone: input.to_phone ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;

  revalidatePath(`/${input.doc_type === "invoice" ? "invoices" : "quotes"}/${input.doc_id}`);
  return data as ScheduledSend;
}

export async function getScheduledSends(doc_type: "invoice" | "quote", doc_id: string): Promise<ScheduledSend[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data, error } = await tbl(supabase, "scheduled_sends")
    .select("*")
    .eq("business_id", businessId)
    .eq("doc_type", doc_type)
    .eq("doc_id", doc_id)
    .order("send_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledSend[];
}

export async function cancelScheduledSend(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const businessId = await getActiveBizId(supabase, user.id);

  const { data: row } = await tbl(supabase, "scheduled_sends")
    .select("doc_type, doc_id, status")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!row) throw new Error("Scheduled send not found");
  if (row.status !== "pending") throw new Error("Already processed — can't cancel");

  const { error } = await tbl(supabase, "scheduled_sends")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;

  revalidatePath(`/${row.doc_type === "invoice" ? "invoices" : "quotes"}/${row.doc_id}`);
}
