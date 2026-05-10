import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupaClient } from "@supabase/supabase-js";

/**
 * Audio transcription endpoint for voice prompts.
 *
 * Accepts a multipart form with field "audio" (any browser-recorded blob —
 * webm/opus, mp4/aac, wav, ogg). Returns { text }.
 *
 * Uses OpenAI Whisper if OPENAI_API_KEY is set. If not, returns a 501 so the
 * client can fall back to the browser's Web Speech API.
 */
export async function POST(request: NextRequest) {
  // Accept either cookie auth (web) or Bearer auth (mobile)
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  let user = null;
  if (bearer) {
    const supa = createSupaClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data } = await supa.auth.getUser(bearer);
    user = data.user;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server transcription not configured. Use browser speech recognition.", code: "NO_PROVIDER" },
      { status: 501 }
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio") as File | null;
  if (!audio || typeof (audio as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const upstream = new FormData();
  const filename = audio.name || "voice.webm";
  upstream.append("file", audio, filename);
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "json");
  // Optional: bias toward business jargon
  upstream.append(
    "prompt",
    "Field service business commands. Common terms: work order, invoice, quote, customer, site, property, contact, billing profile, schedule, assign worker, tomorrow, next week."
  );

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Whisper error: ${errText}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
