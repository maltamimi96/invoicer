import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Twilio sends application/x-www-form-urlencoded
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const from = params.get("From") ?? "";   // customer's number, e.g. +61412345678
    const to   = params.get("To")   ?? "";   // our Twilio number
    const text = params.get("Body") ?? "";
    const sid  = params.get("MessageSid") ?? "";

    if (!from || !text) {
      return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Use admin client — webhook has no user session
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Find the business that owns this Twilio number
    const { data: biz } = await supabase
      .from("businesses" as never)
      .select("id")
      .eq("twilio_phone", to)
      .maybeSingle() as { data: { id: string } | null };

    // Fallback: if only one business, use it (single-tenant setup)
    let businessId = biz?.id;
    if (!businessId) {
      const { data: firstBiz } = await supabase
        .from("businesses" as never)
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle() as { data: { id: string } | null };
      businessId = firstBiz?.id;
    }
    if (!businessId) {
      return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Find or create conversation
    let { data: conv } = await supabase
      .from("sms_conversations" as never)
      .select("id, customer_name, unread_count")
      .eq("business_id", businessId)
      .eq("customer_phone", from)
      .maybeSingle() as { data: { id: string; customer_name: string; unread_count: number } | null };

    if (!conv) {
      // Try to find a matching customer by phone
      const { data: customer } = await supabase
        .from("customers" as never)
        .select("id, name")
        .eq("business_id", businessId)
        .eq("phone", from)
        .maybeSingle() as { data: { id: string; name: string } | null };

      const { data: newConv } = await supabase
        .from("sms_conversations" as never)
        .insert({
          business_id: businessId,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? from,
          customer_phone: from,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select("id, customer_name, unread_count")
        .single() as { data: { id: string; customer_name: string; unread_count: number } };
      conv = newConv;
    } else {
      // Update unread count and last_message_at
      await supabase
        .from("sms_conversations" as never)
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (conv.unread_count ?? 0) + 1,
        })
        .eq("id", conv.id);
    }

    if (!conv) {
      return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }

    // Save the inbound message
    await supabase
      .from("sms_messages" as never)
      .insert({
        conversation_id: conv.id,
        business_id: businessId,
        direction: "inbound",
        body: text,
        from_number: from,
        to_number: to,
        twilio_sid: sid,
        status: "received",
      });

    // Respond with empty TwiML so Twilio doesn't auto-reply
    return new NextResponse("<Response/>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("SMS webhook error:", err);
    return new NextResponse("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }
}
