/**
 * POST /api/report-sessions
 * Creates or retrieves a report session for a Telegram chat.
 * Secured by INTERNAL_API_KEY.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const AGENT_BUSINESS_ID = process.env.AGENT_BUSINESS_ID ?? "ff3a47f3-54b0-45e3-b7a9-69ddc9fa787e";

function checkKey(req: NextRequest) {
  const key = req.headers.get("x-api-key");
  return key === process.env.INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { chat_id, property_address, action } = body as {
    chat_id: string;
    property_address?: string;
    action: "create" | "get" | "add_photo" | "reset";
  };

  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => (sb as any).from(name);

  if (action === "create") {
    // End any existing collecting session for this chat
    await tbl("report_sessions")
      .update({ status: "failed" })
      .eq("chat_id", chat_id)
      .eq("status", "collecting");

    const { data, error } = await tbl("report_sessions")
      .insert({
        business_id: AGENT_BUSINESS_ID,
        chat_id,
        status: "collecting",
        property_address: property_address ?? null,
        photo_file_ids: [],
      })
      .select("id, status, property_address, photo_file_ids")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session: data });
  }

  if (action === "get") {
    const { data } = await tbl("report_sessions")
      .select("id, status, property_address, photo_file_ids")
      .eq("chat_id", chat_id)
      .eq("status", "collecting")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ session: data });
  }

  if (action === "add_photo") {
    const { session_id, file_id } = body as { session_id: string; file_id: string };
    const { data: sess } = await tbl("report_sessions")
      .select("photo_file_ids")
      .eq("id", session_id)
      .single();
    if (!sess) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = [...(sess.photo_file_ids ?? []), file_id];
    await tbl("report_sessions")
      .update({ photo_file_ids: updated, updated_at: new Date().toISOString() })
      .eq("id", session_id);
    return NextResponse.json({ count: updated.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
