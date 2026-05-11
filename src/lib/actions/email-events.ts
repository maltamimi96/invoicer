"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveBizId } from "@/lib/active-business";
import type { EmailDocType } from "@/lib/email";

import { getUser } from "@/lib/auth";
export interface EmailEvent {
  id: string;
  business_id: string;
  resend_id: string | null;
  doc_type: EmailDocType;
  doc_id: string | null;
  recipient: string;
  subject: string | null;
  status: "queued" | "sent" | "delivered" | "bounced" | "complained" | "opened" | "clicked" | "failed" | "delivery_delayed";
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  created_at: string;
}

/** Returns the latest event per recipient for a given document. The UI shows
 *  one row per address with the most-progressed lifecycle status — answering
 *  the customer's "did they get it?" question at a glance. */
export async function getDeliveryStatus(
  doc_type: EmailDocType,
  doc_id: string,
): Promise<EmailEvent[]> {
  const supabase = await createClient();
  const user = await getUser();
  const businessId = await getActiveBizId(supabase, user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("email_events")
    .select("*")
    .eq("business_id", businessId)
    .eq("doc_type", doc_type)
    .eq("doc_id", doc_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Collapse to one row per recipient (the most recent — i.e. the latest
  // lifecycle event for that address).
  const seen = new Set<string>();
  const latest: EmailEvent[] = [];
  for (const row of (data ?? []) as EmailEvent[]) {
    if (seen.has(row.recipient)) continue;
    seen.add(row.recipient);
    latest.push(row);
  }
  return latest;
}
